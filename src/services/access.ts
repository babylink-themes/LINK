import { Capacitor } from '@capacitor/core';
import { appApiFetch } from './appApi';
import { clearNativeSessionToken, getNativeSessionToken, saveNativeSessionToken } from './nativeSession';
import { clearStartupCache } from './startupCache';

export interface AccessSession {
  authenticated: true;
  qq: string;
  deviceId: string;
  deviceLabel: string;
  leaseUntil: number;
}

export interface AccessDevice {
  id: string;
  label: string;
  current: boolean;
  createdAt: number;
  lastSeenAt: number;
}

interface CachedAccessLease {
  qq: string;
  leaseUntil: number;
}

export interface NativeAccessChallenge {
  id: string;
  pollToken: string;
  code: string;
  command: string;
  expiresAt: number;
}

interface NativeAccessChallengeResult {
  state?: string;
  qq?: string;
  deviceId?: string;
  deviceLabel?: string;
  leaseUntil?: number;
  sessionToken?: string;
  message?: string;
  error?: string;
}

const accessLeaseStorageKey = 'link:auth-lease';
const accessDeviceIdStorageKey = 'link:auth-device-id';
const accessChallengeStorageKey = 'link:auth-challenge';

export function isAccessControlEnabled() {
  const configured = String(import.meta.env.VITE_ACCESS_CONTROL_ENABLED ?? '').trim().toLowerCase();
  if (configured) return !['0', 'false', 'off', 'no'].includes(configured);
  return import.meta.env.PROD;
}

function readCachedAccessLease(): CachedAccessLease | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(accessLeaseStorageKey) ?? 'null') as Partial<CachedAccessLease> | null;
    const qq = String(parsed?.qq ?? '').trim();
    const leaseUntil = Number(parsed?.leaseUntil ?? 0);
    if (!qq || !Number.isFinite(leaseUntil)) return null;
    return { qq, leaseUntil };
  } catch {
    return null;
  }
}

function saveAccessLease(session: Pick<AccessSession, 'qq' | 'leaseUntil'>) {
  localStorage.setItem(accessLeaseStorageKey, JSON.stringify({ qq: session.qq, leaseUntil: session.leaseUntil }));
}

function clearAccessLease() {
  localStorage.removeItem(accessLeaseStorageKey);
}

export function saveNativeAccessChallenge(challenge: NativeAccessChallenge) {
  localStorage.setItem(accessChallengeStorageKey, JSON.stringify(challenge));
}

export function readNativeAccessChallenge(): NativeAccessChallenge | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(accessChallengeStorageKey) ?? 'null') as Partial<NativeAccessChallenge> | null;
    const challenge: NativeAccessChallenge = {
      id: String(parsed?.id ?? '').trim(),
      pollToken: String(parsed?.pollToken ?? '').trim(),
      code: String(parsed?.code ?? '').trim(),
      command: String(parsed?.command ?? '').trim(),
      expiresAt: Number(parsed?.expiresAt) || 0
    };
    if (!challenge.id || !challenge.pollToken || !challenge.code || !challenge.command || challenge.expiresAt <= Date.now()) {
      localStorage.removeItem(accessChallengeStorageKey);
      return null;
    }
    return challenge;
  } catch {
    localStorage.removeItem(accessChallengeStorageKey);
    return null;
  }
}

export function clearNativeAccessChallenge() {
  localStorage.removeItem(accessChallengeStorageKey);
}

async function readResponseMessage(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
  return body?.message || body?.error || `访问验证失败 (${response.status})`;
}

function nativeRuntime() {
  return Capacitor.isNativePlatform();
}

function accessDeviceId() {
  const existing = localStorage.getItem(accessDeviceIdStorageKey)?.trim();
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID?.().replaceAll('-', '') || `${Date.now()}${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(accessDeviceIdStorageKey, next);
  return next;
}

function accessDeviceLabel() {
  const platform = Capacitor.getPlatform();
  const device = platform === 'android' ? 'Android' : platform === 'ios' ? 'iPhone / iPad' : '浏览器';
  return `${device} · ${new Date().toLocaleDateString('zh-CN')}`;
}

export async function fetchAccessSession() {
  const response = await appApiFetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) {
    const error = new Error(await readResponseMessage(response));
    error.name = response.status === 401 ? 'AccessRevokedError' : 'AccessRequestError';
    throw error;
  }
  const session = await response.json() as AccessSession;
  saveAccessLease(session);
  return session;
}

export async function ensureAccessOnStartup() {
  if (!isAccessControlEnabled()) return true;
  const native = nativeRuntime();
  if (native && !await getNativeSessionToken()) return false;
  const cachedLease = readCachedAccessLease();
  if (cachedLease && cachedLease.leaseUntil > Date.now()) {
    void fetchAccessSession().catch((error) => {
      if (error instanceof Error && error.name === 'AccessRevokedError') {
        clearAccessLease();
        clearStartupCache();
        void clearNativeSessionToken();
        if (!native) window.location.replace('/access');
      }
    });
    return true;
  }
  try {
    await fetchAccessSession();
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'AccessRevokedError') {
      clearAccessLease();
      clearStartupCache();
      await clearNativeSessionToken();
      if (!native) window.location.replace('/access');
      return false;
    }
    if (!native) window.location.replace('/access');
    return false;
  }
}

export function startAccessHeartbeat() {
  if (!isAccessControlEnabled()) return () => undefined;
  let timer: number | undefined;
  let running = false;

  const verify = async () => {
    if (running) return;
    running = true;
    try {
      await fetchAccessSession();
    } catch (error) {
      if (error instanceof Error && error.name === 'AccessRevokedError') {
        clearAccessLease();
        clearStartupCache();
        void clearNativeSessionToken();
        window.location.replace('/access');
      }
    } finally {
      running = false;
    }
  };
  const visibilityListener = () => {
    if (document.visibilityState === 'visible') void verify();
  };
  document.addEventListener('visibilitychange', visibilityListener);
  timer = window.setInterval(() => void verify(), 10 * 60 * 1000);
  return () => {
    document.removeEventListener('visibilitychange', visibilityListener);
    if (timer !== undefined) window.clearInterval(timer);
  };
}

export async function fetchAccessDevices() {
  const response = await appApiFetch('/api/auth/devices', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(await readResponseMessage(response));
  return await response.json() as AccessDevice[];
}

export async function revokeAccessDevice(deviceId: string) {
  const response = await appApiFetch(`/api/auth/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) throw new Error(await readResponseMessage(response));
}

export async function logoutAccessSession() {
  await appApiFetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
  await clearNativeSessionToken();
  clearAccessLease();
  clearStartupCache();
  window.location.replace('/access');
}

export async function createNativeAccessChallenge(qq: string): Promise<NativeAccessChallenge> {
  const response = await appApiFetch('/api/auth/challenges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Link-Native-Client': 'capacitor' },
    body: JSON.stringify({ qq: qq.trim(), deviceId: accessDeviceId(), deviceLabel: accessDeviceLabel() })
  });
  if (!response.ok) throw new Error(await readResponseMessage(response));
  const payload = await response.json() as Partial<NativeAccessChallenge>;
  const challenge: NativeAccessChallenge = {
    id: String(payload.id ?? '').trim(),
    pollToken: String(payload.pollToken ?? '').trim(),
    code: String(payload.code ?? '').trim(),
    command: String(payload.command ?? '').trim(),
    expiresAt: Number(payload.expiresAt) || 0
  };
  if (!challenge.id || !challenge.pollToken || !challenge.code || !challenge.command || !challenge.expiresAt) throw new Error('服务器返回的验证口令无效。');
  return challenge;
}

export async function pollNativeAccessChallenge(challenge: NativeAccessChallenge): Promise<'pending' | 'authenticated'> {
  const response = await appApiFetch(`/api/auth/challenges/${encodeURIComponent(challenge.id)}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'X-Link-Challenge-Token': challenge.pollToken,
      'X-Link-Native-Client': 'capacitor'
    }
  });
  const payload = await response.json().catch(() => null) as NativeAccessChallengeResult | null;
  if (!response.ok) throw new Error(payload?.message || payload?.error || `验证请求失败 (${response.status})`);
  if (payload?.state === 'pending') return 'pending';
  if (payload?.state !== 'authenticated') throw new Error(payload?.message || '验证状态异常。');

  const sessionToken = String(payload.sessionToken ?? '').trim();
  const session: AccessSession = {
    authenticated: true,
    qq: String(payload.qq ?? '').trim(),
    deviceId: accessDeviceId(),
    deviceLabel: accessDeviceLabel(),
    leaseUntil: Number(payload.leaseUntil) || 0
  };
  if (!sessionToken || !session.qq || !session.leaseUntil) throw new Error('服务器没有返回可用的原生会话。');
  await saveNativeSessionToken(sessionToken);
  saveAccessLease(session);
  return 'authenticated';
}