import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { config } from './config.js';
import { query, transaction } from './db.js';
import { getNapCatRuntimeStatus } from './napcatState.js';
import { createOpaqueToken, hashForAudit, hashSecret } from './security.js';

const qqPattern = /^[1-9]\d{4,11}$/;
const deviceIdPattern = /^[A-Za-z0-9_-]{16,128}$/;
const challengeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface SessionIdentity {
  sessionId: string;
  qq: string;
  deviceId: string;
  deviceLabel: string;
  expiresAt: number;
}

interface SessionRow {
  session_id: string;
  qq: string;
  device_id: string;
  device_label: string;
  expires_at: Date;
}

interface ChallengeRow {
  id: string;
  qq: string;
  device_id: string;
  device_label: string;
  expires_at: Date;
  verified_at: Date | null;
  consumed_at: Date | null;
  error: string;
}

interface CachedSessionIdentity {
  identity: SessionIdentity;
  expiresAt: number;
}

const sessionIdentityCache = new Map<string, CachedSessionIdentity>();

function createChallengeCode(length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => challengeAlphabet[byte % challengeAlphabet.length]).join('');
}

function sessionCookieOptions(expires?: Date) {
  return {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax' as const,
    ...(expires ? { expires } : {})
  };
}

function clientIp(request: FastifyRequest) {
  return request.ip || request.socket.remoteAddress || '';
}

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? String(value[0] ?? '').trim() : String(value ?? '').trim();
}

function requestSessionToken(request: FastifyRequest) {
  return headerValue(request, 'x-link-session') || request.cookies[config.cookieName] || '';
}

function nativeChallengeRequest(request: FastifyRequest) {
  return headerValue(request, 'x-link-native-client') === 'capacitor';
}

function cacheSessionIdentity(tokenHash: string, identity: SessionIdentity) {
  const expiresAt = Math.min(identity.expiresAt, Date.now() + config.sessionCacheSeconds * 1_000);
  sessionIdentityCache.set(tokenHash, { identity, expiresAt });
}

function readCachedSessionIdentity(tokenHash: string) {
  const cached = sessionIdentityCache.get(tokenHash);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now() || cached.identity.expiresAt <= Date.now()) {
    sessionIdentityCache.delete(tokenHash);
    return null;
  }
  return cached.identity;
}

export function invalidateSessionIdentityCacheForQq(qq: string) {
  for (const [tokenHash, cached] of sessionIdentityCache) {
    if (cached.identity.qq === qq) sessionIdentityCache.delete(tokenHash);
  }
}

function invalidateSessionIdentityCacheForToken(token: string) {
  const normalizedToken = token.trim();
  if (normalizedToken) sessionIdentityCache.delete(hashSecret(normalizedToken));
}

export async function recordAudit(action: string, qq = '', detail: Record<string, unknown> = {}, ip = '') {
  await query(
    'INSERT INTO audit_logs (qq, action, detail, ip_hash) VALUES ($1, $2, $3::jsonb, $4)',
    [qq || null, action, JSON.stringify(detail), hashForAudit(ip)]
  );
}

export async function getSessionIdentity(request: FastifyRequest): Promise<SessionIdentity | null> {
  const token = requestSessionToken(request);
  if (!token) return null;

  const tokenHash = hashSecret(token);
  const cached = readCachedSessionIdentity(tokenHash);
  if (cached) return cached;

  const result = await query<SessionRow>(`
    SELECT
      s.id AS session_id,
      s.qq,
      s.device_id,
      d.label AS device_label,
      s.expires_at
    FROM sessions s
    JOIN users u ON u.qq = s.qq
    JOIN devices d ON d.id = s.device_id AND d.qq = s.qq
    WHERE s.token_hash = $1
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
      AND u.status = 'active'
      AND d.revoked_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM memberships m
        JOIN allowed_groups g ON g.group_id = m.group_id AND g.enabled = TRUE
        WHERE m.qq = s.qq
          AND m.active = TRUE
          AND m.last_seen_at > NOW() - ($2::int * INTERVAL '1 hour')
      )
    LIMIT 1
  `, [tokenHash, config.membershipMaxAgeHours]);

  const row = result.rows[0];
  if (!row) return null;
  const identity = {
    sessionId: row.session_id,
    qq: row.qq,
    deviceId: row.device_id,
    deviceLabel: row.device_label,
    expiresAt: row.expires_at.getTime()
  };
  cacheSessionIdentity(tokenHash, identity);
  return identity;
}

export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  const session = await getSessionIdentity(request);
  if (!session) {
    await reply.code(401).send({ error: 'authentication_required', message: '请先通过 QQ 群验证登录。' });
    return null;
  }
  return session;
}

function createLease(session: SessionIdentity) {
  return Math.min(session.expiresAt, Date.now() + config.offlineLeaseHours * 60 * 60 * 1000);
}

async function createSession(client: PoolClient, challenge: ChallengeRow) {
  const existingDevice = await client.query<{ qq: string; revoked_at: Date | null }>(
    'SELECT qq, revoked_at FROM devices WHERE id = $1 FOR UPDATE',
    [challenge.device_id]
  );
  if (existingDevice.rows[0] && existingDevice.rows[0].qq !== challenge.qq) throw new Error('该设备已经绑定其他 QQ。');

  if (!existingDevice.rows[0]) {
    const deviceCount = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM devices WHERE qq = $1 AND revoked_at IS NULL',
      [challenge.qq]
    );
    if (Number(deviceCount.rows[0]?.count ?? 0) >= config.maxDevicesPerUser) {
      throw new Error(`设备数量已达到上限（${config.maxDevicesPerUser} 台），请先在已登录设备中移除旧设备。`);
    }
  }

  await client.query(`
    INSERT INTO devices (id, qq, label, created_at, last_seen_at, revoked_at)
    VALUES ($1, $2, $3, NOW(), NOW(), NULL)
    ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, last_seen_at = NOW(), revoked_at = NULL
  `, [challenge.device_id, challenge.qq, challenge.device_label]);

  const sessionToken = createOpaqueToken();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);
  await client.query(`
    INSERT INTO sessions (id, token_hash, qq, device_id, expires_at)
    VALUES ($1, $2, $3, $4, $5)
  `, [sessionId, hashSecret(sessionToken), challenge.qq, challenge.device_id, expiresAt]);
  await client.query('UPDATE login_challenges SET consumed_at = NOW() WHERE id = $1', [challenge.id]);
  await client.query('UPDATE users SET last_verified_at = NOW(), updated_at = NOW() WHERE qq = $1', [challenge.qq]);
  return { sessionToken, expiresAt };
}

export async function verifyChallengeFromGroup(input: {
  code: string;
  qq: string;
  groupId: string;
  nickname?: string;
  role?: string;
}) {
  if (!qqPattern.test(input.qq)) return { ok: false, message: 'QQ 号码格式无效。' };
  const group = await query<{ group_id: string }>(
    'SELECT group_id FROM allowed_groups WHERE group_id = $1 AND enabled = TRUE',
    [input.groupId]
  );
  if (!group.rows[0]) return { ok: false, message: '该群不在授权范围内。' };

  return await transaction(async (client) => {
    const challengeResult = await client.query<ChallengeRow>(`
      SELECT id, qq, device_id, device_label, expires_at, verified_at, consumed_at, error
      FROM login_challenges
      WHERE code_hash = $1
      FOR UPDATE
    `, [hashSecret(input.code.toUpperCase())]);
    const challenge = challengeResult.rows[0];
    if (!challenge || challenge.expires_at.getTime() <= Date.now()) return { ok: false, message: '验证码不存在或已经过期。' };
    if (challenge.qq !== input.qq) return { ok: false, message: '验证码与发送 QQ 不匹配。' };
    if (challenge.consumed_at) return { ok: false, message: '验证码已经使用。' };

    await client.query(`
      INSERT INTO users (qq, status, last_verified_at)
      VALUES ($1, 'active', NOW())
      ON CONFLICT (qq) DO UPDATE SET last_verified_at = NOW(), updated_at = NOW()
    `, [input.qq]);
    const userStatus = await client.query<{ status: string }>('SELECT status FROM users WHERE qq = $1', [input.qq]);
    if (userStatus.rows[0]?.status === 'banned') return { ok: false, message: '该 QQ 已被管理员停用。' };

    await client.query(`
      INSERT INTO memberships (qq, group_id, active, role, nickname, last_seen_at, updated_at)
      VALUES ($1, $2, TRUE, $3, $4, NOW(), NOW())
      ON CONFLICT (qq, group_id) DO UPDATE SET
        active = TRUE,
        role = EXCLUDED.role,
        nickname = EXCLUDED.nickname,
        last_seen_at = NOW(),
        updated_at = NOW()
    `, [input.qq, input.groupId, input.role || 'member', input.nickname || '']);
    await client.query('UPDATE login_challenges SET verified_at = NOW(), error = $2 WHERE id = $1', [challenge.id, '']);
    return { ok: true, message: '验证成功，请返回 BabyLink 页面。' };
  });
}

export async function updateMembership(input: {
  qq: string;
  groupId: string;
  active: boolean;
  nickname?: string;
  role?: string;
}) {
  const user = await query<{ qq: string }>('SELECT qq FROM users WHERE qq = $1', [input.qq]);
  if (!user.rows[0]) return;
  await query(`
    INSERT INTO memberships (qq, group_id, active, role, nickname, last_seen_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT (qq, group_id) DO UPDATE SET
      active = EXCLUDED.active,
      role = EXCLUDED.role,
      nickname = EXCLUDED.nickname,
      last_seen_at = NOW(),
      updated_at = NOW()
  `, [input.qq, input.groupId, input.active, input.role || 'member', input.nickname || '']);

  if (!input.active) {
    await revokeSessionsWithoutMembership(input.qq);
    invalidateSessionIdentityCacheForQq(input.qq);
  }
}

export async function revokeSessionsWithoutMembership(qq: string) {
  await query(`
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE qq = $1
      AND revoked_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM memberships m
        JOIN allowed_groups g ON g.group_id = m.group_id AND g.enabled = TRUE
        WHERE m.qq = $1 AND m.active = TRUE
      )
  `, [qq]);
}

export async function revokeAllDevicesForQq(qq: string) {
  return await transaction(async (client) => {
    const devices = await client.query(`
      UPDATE devices
      SET revoked_at = NOW()
      WHERE qq = $1 AND revoked_at IS NULL
      RETURNING id
    `, [qq]);
    const sessions = await client.query(`
      UPDATE sessions
      SET revoked_at = NOW()
      WHERE qq = $1 AND revoked_at IS NULL
      RETURNING id
    `, [qq]);
    await client.query(`
      UPDATE login_challenges
      SET error = '该账号已通过 QQ 清空登录设备。'
      WHERE qq = $1
        AND consumed_at IS NULL
        AND expires_at > NOW()
        AND error = ''
    `, [qq]);
    invalidateSessionIdentityCacheForQq(qq);
    return { devices: devices.rowCount ?? 0, sessions: sessions.rowCount ?? 0 };
  });
}

function isAdminRequest(request: FastifyRequest) {
  if (!config.adminToken) return false;
  return request.headers.authorization === `Bearer ${config.adminToken}`;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/api/auth/config', async () => {
    const groups = await query<{ group_id: string; name: string }>(
      'SELECT group_id, name FROM allowed_groups WHERE enabled = TRUE ORDER BY group_id'
    );
    const bot = getNapCatRuntimeStatus();
    return {
      enabled: Boolean(groups.rowCount),
      groups: groups.rows.map((group) => ({ id: group.group_id, name: group.name })),
      challengeMinutes: config.challengeMinutes,
      maxDevices: config.maxDevicesPerUser,
      botOnline: bot.online,
      botCheckedAt: bot.checkedAt
    };
  });

  app.post('/api/auth/challenges', {
    config: { rateLimit: { max: 8, timeWindow: '10 minutes' } }
  }, async (request, reply) => {
    const body = request.body as { qq?: unknown; deviceId?: unknown; deviceLabel?: unknown } | null;
    const qq = String(body?.qq ?? '').trim();
    const deviceId = String(body?.deviceId ?? '').trim();
    const deviceLabel = String(body?.deviceLabel ?? '').trim().slice(0, 80);
    if (!qqPattern.test(qq)) return await reply.code(400).send({ error: 'invalid_qq', message: '请输入有效 QQ 号。' });
    if (!deviceIdPattern.test(deviceId)) return await reply.code(400).send({ error: 'invalid_device', message: '设备标识无效，请刷新后重试。' });

    const groupCount = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM allowed_groups WHERE enabled = TRUE');
    if (!Number(groupCount.rows[0]?.count ?? 0)) return await reply.code(503).send({ error: 'groups_unavailable', message: '管理员尚未配置授权群。' });
    if (!getNapCatRuntimeStatus().online) {
      return await reply.code(503).send({ error: 'bot_offline', message: '验证机器人当前离线，请联系管理员恢复后再获取口令。' });
    }

    const id = randomUUID();
    const code = createChallengeCode();
    const pollToken = createOpaqueToken();
    const expiresAt = new Date(Date.now() + config.challengeMinutes * 60 * 1000);
    await query(`
      INSERT INTO login_challenges (id, qq, code_hash, poll_token_hash, device_id, device_label, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, qq, hashSecret(code), hashSecret(pollToken), deviceId, deviceLabel, expiresAt]);
    await recordAudit('auth.challenge.created', qq, { deviceId }, clientIp(request));
    return await reply.code(201).send({
      id,
      pollToken,
      code,
      expiresAt: expiresAt.getTime(),
      command: `/link 绑定 ${code}`
    });
  });

  app.get('/api/auth/challenges/:id', {
    config: { rateLimit: { max: 90, timeWindow: '10 minutes' } }
  }, async (request, reply) => {
    const id = String((request.params as { id?: string }).id ?? '');
    const pollToken = String(request.headers['x-link-challenge-token'] ?? '');
    if (!pollToken) return await reply.code(401).send({ error: 'challenge_token_required' });

    try {
      const result = await transaction(async (client) => {
        const challengeResult = await client.query<ChallengeRow>(`
          SELECT id, qq, device_id, device_label, expires_at, verified_at, consumed_at, error
          FROM login_challenges
          WHERE id = $1 AND poll_token_hash = $2
          FOR UPDATE
        `, [id, hashSecret(pollToken)]);
        const challenge = challengeResult.rows[0];
        if (!challenge) return { state: 'missing' as const };
        if (challenge.error) return { state: 'error' as const, message: challenge.error };
        if (challenge.expires_at.getTime() <= Date.now()) return { state: 'expired' as const };
        if (!challenge.verified_at) return { state: 'pending' as const, expiresAt: challenge.expires_at.getTime() };
        if (challenge.consumed_at) return { state: 'consumed' as const };
        const session = await createSession(client, challenge);
        return { state: 'authenticated' as const, qq: challenge.qq, ...session };
      });

      if (result.state === 'missing') return await reply.code(404).send({ state: 'missing', message: '登录请求不存在。' });
      if (result.state === 'expired') return await reply.code(410).send({ state: 'expired', message: '验证码已经过期。' });
      if (result.state === 'error') return await reply.code(403).send(result);
      if (result.state === 'consumed') return await reply.code(409).send({ state: 'consumed', message: '该登录请求已经完成。' });
      if (result.state === 'pending') return result;

      reply.setCookie(config.cookieName, result.sessionToken, sessionCookieOptions(result.expiresAt));
      await recordAudit('auth.login', result.qq, {}, clientIp(request));
      return {
        state: 'authenticated',
        qq: result.qq,
        leaseUntil: Math.min(result.expiresAt.getTime(), Date.now() + config.offlineLeaseHours * 60 * 60 * 1000),
        ...(nativeChallengeRequest(request) ? { sessionToken: result.sessionToken } : {})
      };
    } catch (error) {
      return await reply.code(409).send({
        state: 'error',
        message: error instanceof Error ? error.message : '无法创建设备会话。'
      });
    }
  });

  app.get('/api/auth/me', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    await query('UPDATE sessions SET last_seen_at = NOW() WHERE id = $1', [session.sessionId]);
    await query('UPDATE devices SET last_seen_at = NOW() WHERE id = $1', [session.deviceId]);
    return { authenticated: true, qq: session.qq, deviceId: session.deviceId, deviceLabel: session.deviceLabel, leaseUntil: createLease(session) };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = requestSessionToken(request);
    if (token) {
      await query('UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1', [hashSecret(token)]);
      invalidateSessionIdentityCacheForToken(token);
    }
    reply.clearCookie(config.cookieName, sessionCookieOptions());
    return { ok: true };
  });

  app.get('/api/auth/devices', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const devices = await query<{ id: string; label: string; created_at: Date; last_seen_at: Date }>(`
      SELECT id, label, created_at, last_seen_at
      FROM devices
      WHERE qq = $1 AND revoked_at IS NULL
      ORDER BY last_seen_at DESC
    `, [session.qq]);
    return devices.rows.map((device) => ({
      id: device.id,
      label: device.label,
      current: device.id === session.deviceId,
      createdAt: device.created_at.getTime(),
      lastSeenAt: device.last_seen_at.getTime()
    }));
  });

  app.delete('/api/auth/devices/:id', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const deviceId = String((request.params as { id?: string }).id ?? '');
    await transaction(async (client) => {
      await client.query('UPDATE devices SET revoked_at = NOW() WHERE id = $1 AND qq = $2', [deviceId, session.qq]);
      await client.query('UPDATE sessions SET revoked_at = NOW() WHERE device_id = $1 AND qq = $2', [deviceId, session.qq]);
    });
    invalidateSessionIdentityCacheForQq(session.qq);
    if (deviceId === session.deviceId) reply.clearCookie(config.cookieName, sessionCookieOptions());
    await recordAudit('auth.device.revoked', session.qq, { deviceId }, clientIp(request));
    return { ok: true };
  });

  app.get('/api/admin/overview', async (request, reply) => {
    if (!isAdminRequest(request)) return await reply.code(401).send({ error: 'admin_auth_required' });
    const [users, sessions, groups] = await Promise.all([
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users'),
      query<{ count: string }>('SELECT COUNT(*)::text AS count FROM sessions WHERE revoked_at IS NULL AND expires_at > NOW()'),
      query<{ group_id: string; name: string; enabled: boolean }>('SELECT group_id, name, enabled FROM allowed_groups ORDER BY group_id')
    ]);
    return { users: Number(users.rows[0]?.count ?? 0), activeSessions: Number(sessions.rows[0]?.count ?? 0), groups: groups.rows };
  });

  app.put('/api/admin/groups/:groupId', async (request, reply) => {
    if (!isAdminRequest(request)) return await reply.code(401).send({ error: 'admin_auth_required' });
    const groupId = String((request.params as { groupId?: string }).groupId ?? '').trim();
    const body = request.body as { name?: unknown; enabled?: unknown } | null;
    if (!/^\d{5,20}$/.test(groupId)) return await reply.code(400).send({ error: 'invalid_group_id' });
    const enabled = body?.enabled !== false;
    await query(`
      INSERT INTO allowed_groups (group_id, name, enabled)
      VALUES ($1, $2, $3)
      ON CONFLICT (group_id) DO UPDATE SET name = EXCLUDED.name, enabled = EXCLUDED.enabled, updated_at = NOW()
    `, [groupId, String(body?.name ?? '').trim().slice(0, 80), enabled]);
    if (!enabled) {
      const memberships = await query<{ qq: string }>('SELECT DISTINCT qq FROM memberships WHERE group_id = $1 AND active = TRUE', [groupId]);
      await Promise.all(memberships.rows.map(async ({ qq }) => {
        await revokeSessionsWithoutMembership(qq);
        invalidateSessionIdentityCacheForQq(qq);
      }));
    }
    return { ok: true };
  });

  app.put('/api/admin/users/:qq/status', async (request, reply) => {
    if (!isAdminRequest(request)) return await reply.code(401).send({ error: 'admin_auth_required' });
    const qq = String((request.params as { qq?: string }).qq ?? '').trim();
    const status = String((request.body as { status?: unknown } | null)?.status ?? '');
    if (!qqPattern.test(qq) || !['active', 'banned'].includes(status)) return await reply.code(400).send({ error: 'invalid_status_request' });
    await query('UPDATE users SET status = $2, updated_at = NOW() WHERE qq = $1', [qq, status]);
    if (status === 'banned') {
      await query('UPDATE sessions SET revoked_at = NOW() WHERE qq = $1 AND revoked_at IS NULL', [qq]);
      invalidateSessionIdentityCacheForQq(qq);
    }
    await recordAudit('admin.user.status', qq, { status }, clientIp(request));
    return { ok: true };
  });
}