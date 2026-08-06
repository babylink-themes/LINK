import { Capacitor } from '@capacitor/core';
import { getNativeSessionToken } from './nativeSession';

const configuredApiOrigin = String(import.meta.env?.VITE_APP_API_ORIGIN ?? 'https://babylink.top').trim().replace(/\/+$/, '');

function nativeApiOrigin() {
  try {
    return new URL(configuredApiOrigin).origin;
  } catch {
    return 'https://babylink.top';
  }
}

function inputUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export function isNativeAppRuntime() {
  return Capacitor.isNativePlatform();
}

export function getAppApiOrigin() {
  return nativeApiOrigin();
}

export function appApiUrl(path: string) {
  if (!isNativeAppRuntime() || !path.startsWith('/')) return path;
  return new URL(path, `${nativeApiOrigin()}/`).toString();
}

function isApplicationRequest(input: RequestInfo | URL) {
  const rawUrl = inputUrl(input);
  if (rawUrl.startsWith('/')) return true;
  try {
    return new URL(rawUrl).origin === nativeApiOrigin();
  } catch {
    return false;
  }
}

export async function appApiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  if (!isNativeAppRuntime() || !isApplicationRequest(input)) return await fetch(input, init);

  const headers = new Headers(init.headers);
  const sessionToken = await getNativeSessionToken();
  if (sessionToken && !headers.has('X-Link-Session')) headers.set('X-Link-Session', sessionToken);
  return await fetch(appApiUrl(inputUrl(input)), {
    ...init,
    headers,
    credentials: 'omit'
  });
}