import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getSessionIdentity, requireSession, recordAudit } from './auth.js';
import { query } from './db.js';
import { config } from './config.js';
import { decryptSecret, encryptSecret } from './security.js';

const moltbookOrigin = 'https://www.moltbook.com';
const moltbookApiBase = `${moltbookOrigin}/api/v1`;
const maxBodyLength = 120_000;
const sensitiveMetadataKey = /api[_-]?key|token|secret|password|authorization|cookie/i;

type ClaimStatus = 'pending' | 'claimed' | 'unclaimed' | 'disabled' | 'unknown';
type ActivityStatus = 'succeeded' | 'failed' | 'rate-limited' | 'verification-pending' | 'pending' | 'blocked';

interface MoltbookAccountRow {
  id: string;
  agent_name: string;
  api_key_ciphertext: string;
  claim_url: string;
  verification_code: string;
  claim_status: ClaimStatus;
  agent_profile_url: string;
  agent_metadata: Record<string, unknown>;
  last_checked_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface MoltbookActivityRow {
  id: string;
  account_id: string;
  character_id: string;
  action: string;
  tool_name: string;
  target: string;
  status: ActivityStatus;
  summary: string;
  response_metadata: Record<string, unknown>;
  created_at: Date;
}

interface MoltbookResponse {
  status: number;
  headers: Headers;
  payload: unknown;
}

function safeAccount(row: MoltbookAccountRow) {
  return {
    id: row.id,
    agentName: row.agent_name,
    claimUrl: row.claim_url,
    verificationCode: row.verification_code,
    claimStatus: row.claim_status,
    agentProfileUrl: row.agent_profile_url,
    metadata: row.agent_metadata,
    lastCheckedAt: row.last_checked_at?.getTime() ?? 0,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime()
  };
}

function safeAgentMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => safeAgentMetadata(entry));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !sensitiveMetadataKey.test(key))
    .map(([key, entry]) => [key, safeAgentMetadata(entry)]));
}

function safeActivity(row: MoltbookActivityRow) {
  return {
    id: row.id,
    accountId: row.account_id,
    characterId: row.character_id,
    action: row.action,
    toolName: row.tool_name,
    target: row.target,
    status: row.status,
    summary: row.summary,
    metadata: row.response_metadata,
    createdAt: row.created_at.getTime()
  };
}

function requestBody(request: FastifyRequest) {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) return {};
  return request.body as Record<string, unknown>;
}

function text(value: unknown, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function pathSegment(value: unknown, label: string) {
  const normalized = text(value, 200);
  if (!normalized || normalized.includes('/') || normalized.includes('\\') || normalized.includes('?') || normalized.includes('#')) throw new Error(`${label} 无效。`);
  return encodeURIComponent(normalized);
}

function jsonValue(payload: unknown) {
  if (payload && typeof payload === 'object') return payload as Record<string, unknown>;
  return { value: payload };
}

function verificationRequired(payload: unknown) {
  const body = jsonValue(payload);
  const verification = body.verification;
  return body.verification_required === true
    || (verification && typeof verification === 'object' && !Array.isArray(verification) && (verification as Record<string, unknown>).required === true);
}

function errorMessage(payload: unknown, fallback: string) {
  const body = jsonValue(payload);
  return text(body.error ?? body.message ?? body.detail ?? fallback, 500) || fallback;
}

function statusFromPayload(payload: unknown): ClaimStatus {
  const status = text(jsonValue(payload).status).toLowerCase();
  if (status === 'claimed') return 'claimed';
  if (status === 'unclaimed' || status === 'pending_claim') return 'pending';
  if (status === 'disabled') return 'disabled';
  return 'unknown';
}

function activityStatus(response: MoltbookResponse, payload: unknown): ActivityStatus {
  if (response.status === 429) return 'rate-limited';
  const body = jsonValue(payload);
  if (response.status === 202 || verificationRequired(payload)) return 'verification-pending';
  return response.status >= 200 && response.status < 300 && body.success !== false ? 'succeeded' : 'failed';
}

async function callMoltbook(path: string, apiKey: string, init: RequestInit = {}): Promise<MoltbookResponse> {
  const target = new URL(`${moltbookApiBase}${path.startsWith('/') ? path : `/${path}`}`);
  if (target.origin !== moltbookOrigin || !target.pathname.startsWith('/api/v1/')) throw new Error('Moltbook 请求地址不受支持。');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${apiKey}`);
  headers.set('User-Agent', 'BabyLink-Moltbook/1.0');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(target, { ...init, headers, signal: AbortSignal.timeout(config.upstreamTimeoutMs) });
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = { raw: raw.slice(0, maxBodyLength) }; }
  return { status: response.status, headers: response.headers, payload };
}

async function publicMoltbook(path: string, init: RequestInit = {}) {
  const target = new URL(`${moltbookApiBase}${path.startsWith('/') ? path : `/${path}`}`);
  if (target.origin !== moltbookOrigin || !target.pathname.startsWith('/api/v1/')) throw new Error('Moltbook 请求地址不受支持。');
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('User-Agent', 'BabyLink-Moltbook/1.0');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(target, { ...init, headers, signal: AbortSignal.timeout(config.upstreamTimeoutMs) });
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = { raw: raw.slice(0, maxBodyLength) }; }
  return { status: response.status, headers: response.headers, payload };
}

async function findAccount(qq: string, accountId: string) {
  const result = await query<MoltbookAccountRow>(`SELECT * FROM moltbook_accounts WHERE id = $1 AND qq = $2 LIMIT 1`, [accountId, qq]);
  return result.rows[0] ?? null;
}

async function createActivity(account: MoltbookAccountRow, qq: string, input: { characterId?: unknown; action: string; toolName?: string; target?: unknown; response: MoltbookResponse; summary?: string }) {
  const status = activityStatus(input.response, input.response.payload);
  const body = jsonValue(input.response.payload);
  const metadata = {
    httpStatus: input.response.status,
    retryAfter: input.response.headers.get('retry-after') ?? '',
    verificationRequired: verificationRequired(input.response.payload),
    cooldownSeconds: Number(body.cooldown_seconds ?? body.cooldownSeconds ?? 0) || 0
  };
  const summary = text(input.summary ?? (status === 'succeeded' ? 'Moltbook 已确认操作。' : errorMessage(input.response.payload, 'Moltbook 拒绝了该操作。')), 500);
  await query(`INSERT INTO moltbook_activity (id, account_id, qq, character_id, action, tool_name, target, status, summary, response_metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`, [randomUUID(), account.id, qq, text(input.characterId, 160), input.action, text(input.toolName, 160), text(input.target, 300), status, summary, JSON.stringify(metadata)]);
  return { status, summary, metadata };
}

function operationPath(toolName: string, args: Record<string, unknown>) {
  switch (toolName) {
    case 'moltbook_get_home': return { method: 'GET', path: '/home', body: undefined, target: '' };
    case 'moltbook_get_profile': return { method: 'GET', path: '/agents/me', body: undefined, target: '' };
    case 'moltbook_get_feed': {
      const params = new URLSearchParams();
      if (args.sort) params.set('sort', text(args.sort, 20));
      if (args.filter) params.set('filter', text(args.filter, 20));
      params.set('limit', String(integer(args.limit, 20, 1, 50)));
      if (args.cursor) params.set('cursor', text(args.cursor, 300));
      return { method: 'GET', path: `/feed?${params.toString()}`, body: undefined, target: '' };
    }
    case 'moltbook_search': {
      const params = new URLSearchParams({ q: text(args.q, 500), type: text(args.type, 20) || 'all', limit: String(integer(args.limit, 20, 1, 50)) });
      if (args.cursor) params.set('cursor', text(args.cursor, 300));
      return { method: 'GET', path: `/search?${params.toString()}`, body: undefined, target: text(args.q, 300) };
    }
    case 'moltbook_get_post': return { method: 'GET', path: `/posts/${pathSegment(args.postId, 'postId')}`, body: undefined, target: args.postId };
    case 'moltbook_get_comments': {
      const params = new URLSearchParams({ sort: text(args.sort, 20) || 'best', limit: String(integer(args.limit, 50, 1, 100)) });
      if (args.cursor) params.set('cursor', text(args.cursor, 300));
      return { method: 'GET', path: `/posts/${pathSegment(args.postId, 'postId')}/comments?${params.toString()}`, body: undefined, target: args.postId };
    }
    case 'moltbook_create_post': return { method: 'POST', path: '/posts', body: { submolt_name: text(args.submoltName, 80), title: text(args.title, 300), ...(args.content ? { content: text(args.content, 40_000) } : {}), ...(args.url ? { url: text(args.url, 2000) } : {}), ...(args.type ? { type: text(args.type, 20) } : {}) }, target: args.submoltName };
    case 'moltbook_create_comment': return { method: 'POST', path: `/posts/${pathSegment(args.postId, 'postId')}/comments`, body: { content: text(args.content, 40_000), ...(args.parentId ? { parent_id: text(args.parentId, 200) } : {}) }, target: args.postId };
    case 'moltbook_upvote_post': return { method: 'POST', path: `/posts/${pathSegment(args.postId, 'postId')}/upvote`, body: {}, target: args.postId };
    case 'moltbook_downvote_post': return { method: 'POST', path: `/posts/${pathSegment(args.postId, 'postId')}/downvote`, body: {}, target: args.postId };
    case 'moltbook_upvote_comment': return { method: 'POST', path: `/comments/${pathSegment(args.commentId, 'commentId')}/upvote`, body: {}, target: args.commentId };
    case 'moltbook_downvote_comment': return { method: 'POST', path: `/comments/${pathSegment(args.commentId, 'commentId')}/downvote`, body: {}, target: args.commentId };
    case 'moltbook_follow_agent': return { method: 'POST', path: `/agents/${pathSegment(args.agentName, 'agentName')}/follow`, body: {}, target: args.agentName };
    case 'moltbook_unfollow_agent': return { method: 'DELETE', path: `/agents/${pathSegment(args.agentName, 'agentName')}/follow`, body: undefined, target: args.agentName };
    case 'moltbook_create_submolt': return { method: 'POST', path: '/submolts', body: { name: text(args.name, 80), display_name: text(args.displayName, 120), description: text(args.description, 5000), allow_crypto: args.allowCrypto === true }, target: args.name };
    case 'moltbook_subscribe_submolt': return { method: 'POST', path: `/submolts/${pathSegment(args.submoltName, 'submoltName')}/subscribe`, body: {}, target: args.submoltName };
    case 'moltbook_unsubscribe_submolt': return { method: 'DELETE', path: `/submolts/${pathSegment(args.submoltName, 'submoltName')}/subscribe`, body: undefined, target: args.submoltName };
    case 'moltbook_verify_content': return { method: 'POST', path: '/verify', body: { verification_code: text(args.verificationCode, 200), answer: text(args.answer, 100) }, target: args.verificationCode };
    default: throw new Error('不支持的 Moltbook 工具。');
  }
}

async function performAccountAction(account: MoltbookAccountRow, qq: string, toolName: string, args: Record<string, unknown>, characterId?: unknown) {
  const action = operationPath(toolName, args);
  let response: MoltbookResponse;
  try {
    response = await callMoltbook(action.path, decryptSecret(account.api_key_ciphertext), {
      method: action.method,
      ...(action.body === undefined ? {} : { body: JSON.stringify(action.body) })
    });
  } catch (error) {
    response = {
      status: 0,
      headers: new Headers(),
      payload: { error: error instanceof Error ? error.message : 'Moltbook 网络请求失败。' }
    };
  }
  const activity = await createActivity(account, qq, { characterId, action: toolName.replace(/^moltbook_/, ''), toolName, target: action.target, response });
  if (response.status === 0) return { ok: false, status: 502, error: errorMessage(response.payload, 'Moltbook 网络请求失败。'), activity, payload: response.payload };
  if (response.status === 429) {
    return { ok: false, status: response.status, error: 'Moltbook 当前限流，请稍后再试。', retryAfter: response.headers.get('retry-after') ?? '', activity, payload: response.payload };
  }
  if (activity.status === 'verification-pending') {
    return { ok: false, status: response.status, error: 'Moltbook 要求完成内容验证后才能公开。', activity, payload: response.payload };
  }
  return { ok: response.status >= 200 && response.status < 300 && activity.status === 'succeeded', status: response.status, ...(response.status >= 200 && response.status < 300 ? {} : { error: errorMessage(response.payload, 'Moltbook 操作失败。') }), activity, payload: response.payload };
}

export async function executeMoltbookAction(input: { qq: string; accountId: string; toolName: string; args: Record<string, unknown>; characterId?: unknown }) {
  const account = await findAccount(input.qq, input.accountId);
  if (!account) return { ok: false, status: 404, error: '未找到 Moltbook 账号绑定。' };
  if (account.claim_status !== 'claimed') return { ok: false, status: 409, error: `Moltbook 账号尚未完成认领（${account.claim_status}）。`, claimStatus: account.claim_status };
  return await performAccountAction(account, input.qq, input.toolName, input.args, input.characterId);
}

export function registerMoltbookRoutes(app: FastifyInstance) {
  app.post('/api/moltbook/accounts/register', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const body = requestBody(request);
    const agentName = text(body.agentName, 80);
    if (!/^[A-Za-z0-9_-]{3,30}$/.test(agentName)) return await reply.code(400).send({ error: 'invalid_agent_name', message: 'Agent 名称必须是 3–30 个字符，只能包含字母、数字、下划线和短横线。' });
    let response: Awaited<ReturnType<typeof publicMoltbook>>;
    try {
      response = await publicMoltbook('/agents/register', { method: 'POST', body: JSON.stringify({ name: agentName, description: text(body.description, 1000) }) });
    } catch {
      return await reply.code(502).send({ error: 'moltbook_upstream_unavailable', message: '暂时无法连接 Moltbook 官方注册服务，请稍后重试。' });
    }
    if (response.status < 200 || response.status >= 300) {
      const clientStatus = response.status >= 400 && response.status < 500 ? response.status : 502;
      return await reply.code(clientStatus).send({ error: errorMessage(response.payload, 'Moltbook Agent 注册失败。'), retryAfter: response.headers.get('retry-after') ?? '' });
    }
    const data = jsonValue(response.payload);
    const agent = jsonValue(data.agent ?? data);
    const apiKey = text(agent.api_key ?? agent.apiKey, 500);
    if (!apiKey) return await reply.code(502).send({ error: 'moltbook_registration_missing_key', message: 'Moltbook 注册响应没有返回 API Key。' });
    const name = text(agent.name, 80) || agentName;
    const result = await query<MoltbookAccountRow>(`INSERT INTO moltbook_accounts (id, qq, agent_name, api_key_ciphertext, claim_url, verification_code, claim_status, agent_profile_url, agent_metadata, last_checked_at) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8::jsonb, NOW()) ON CONFLICT (qq, agent_name) DO UPDATE SET api_key_ciphertext = EXCLUDED.api_key_ciphertext, claim_url = EXCLUDED.claim_url, verification_code = EXCLUDED.verification_code, claim_status = 'pending', agent_profile_url = EXCLUDED.agent_profile_url, agent_metadata = EXCLUDED.agent_metadata, last_checked_at = NOW(), updated_at = NOW() RETURNING *`, [randomUUID(), session.qq, name, encryptSecret(apiKey), text(agent.claim_url ?? agent.claimUrl, 2000), text(agent.verification_code ?? agent.verificationCode, 200), text(agent.profile_url ?? `${moltbookOrigin}/u/${name}`, 2000), JSON.stringify(safeAgentMetadata(agent))]);
    await recordAudit('moltbook.account.registered', session.qq, { agentName: name });
    return safeAccount(result.rows[0]!);
  });

  app.get('/api/moltbook/accounts', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const result = await query<MoltbookAccountRow>('SELECT * FROM moltbook_accounts WHERE qq = $1 ORDER BY updated_at DESC', [session.qq]);
    return result.rows.map(safeAccount);
  });

  app.post('/api/moltbook/accounts/:id/status', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const accountId = text((request.params as { id?: string }).id, 80);
    const account = await findAccount(session.qq, accountId);
    if (!account) return await reply.code(404).send({ error: 'moltbook_account_not_found' });
    const response = await callMoltbook('/agents/status', decryptSecret(account.api_key_ciphertext), { method: 'GET' });
    const status = statusFromPayload(response.payload);
    const updated = await query<MoltbookAccountRow>('UPDATE moltbook_accounts SET claim_status = $3, last_checked_at = NOW(), updated_at = NOW(), agent_metadata = $4::jsonb WHERE id = $1 AND qq = $2 RETURNING *', [account.id, session.qq, status, JSON.stringify(safeAgentMetadata(response.payload))]);
    if (response.status < 200 || response.status >= 300) return await reply.code(response.status === 429 ? 429 : 502).send({ error: errorMessage(response.payload, 'Moltbook 状态查询失败。'), retryAfter: response.headers.get('retry-after') ?? '', account: safeAccount(updated.rows[0]!) });
    return safeAccount(updated.rows[0]!);
  });

  app.get('/api/moltbook/accounts/:id/profile', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const accountId = text((request.params as { id?: string }).id, 80);
    const account = await findAccount(session.qq, accountId);
    if (!account) return await reply.code(404).send({ error: 'moltbook_account_not_found' });
    const response = await callMoltbook('/agents/me', decryptSecret(account.api_key_ciphertext));
    return await reply.code(response.status).send(response.payload);
  });

  app.post('/api/moltbook/accounts/:id/actions', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const accountId = text((request.params as { id?: string }).id, 80);
    const body = requestBody(request);
    const toolName = text(body.toolName, 100);
    if (!/^moltbook_[a-z0-9_]+$/.test(toolName)) return await reply.code(400).send({ error: 'invalid_moltbook_tool' });
    try {
      const result = await executeMoltbookAction({ qq: session.qq, accountId, toolName, args: (body.args && typeof body.args === 'object' ? body.args : {}) as Record<string, unknown>, characterId: body.characterId });
      return await reply.code(result.ok ? 200 : result.status === 429 ? 429 : result.status >= 500 ? 502 : result.status).send(result);
    } catch (error) {
      return await reply.code(502).send({ error: error instanceof Error ? error.message : 'Moltbook 请求失败。' });
    }
  });

  app.get('/api/moltbook/activity', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const limit = integer((request.query as { limit?: unknown }).limit, 50, 1, 200);
    const result = await query<MoltbookActivityRow>('SELECT id::text, account_id, character_id, action, tool_name, target, status, summary, response_metadata, created_at FROM moltbook_activity WHERE qq = $1 ORDER BY created_at DESC LIMIT $2', [session.qq, limit]);
    return result.rows.map(safeActivity);
  });

  app.delete('/api/moltbook/accounts/:id', async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const accountId = text((request.params as { id?: string }).id, 80);
    await query('DELETE FROM moltbook_accounts WHERE id = $1 AND qq = $2', [accountId, session.qq]);
    return { ok: true };
  });
}
