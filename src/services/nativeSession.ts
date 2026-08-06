import { Capacitor, registerPlugin } from '@capacitor/core';

interface LinkSessionPlugin {
  clearSession(): Promise<void>;
  getSession(): Promise<{ token: string }>;
  setSession(options: { token: string }): Promise<void>;
}

const LinkSession = registerPlugin<LinkSessionPlugin>('LinkSession');

export function isNativeSessionStorageAvailable() {
  return Capacitor.isNativePlatform();
}

export async function getNativeSessionToken() {
  if (!isNativeSessionStorageAvailable()) return '';
  try {
    return String((await LinkSession.getSession()).token ?? '').trim();
  } catch {
    return '';
  }
}

export async function saveNativeSessionToken(token: string) {
  const normalizedToken = token.trim();
  if (!normalizedToken) throw new Error('原生会话令牌为空。');
  if (!isNativeSessionStorageAvailable()) throw new Error('当前原生应用无法访问系统安全存储，请更新应用后重试。');
  await LinkSession.setSession({ token: normalizedToken });
}

export async function clearNativeSessionToken() {
  if (!isNativeSessionStorageAvailable()) return;
  await LinkSession.clearSession().catch(() => undefined);
}