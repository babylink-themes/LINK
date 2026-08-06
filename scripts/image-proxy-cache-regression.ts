import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createImageProxyCacheKey,
  ImageProxyCache,
  imageProxyCdnCacheTtlMs,
  imageProxyResponseCacheControl,
  imageProxyResponseCacheTtlMs,
  isImageProxyUrlCacheable
} from '../server/src/imageProxyCache';

const publicTarget = new URL('https://images.example.com/avatar.png?width=640');
assert.equal(isImageProxyUrlCacheable(publicTarget), true);
assert.equal(isImageProxyUrlCacheable(publicTarget, 'Bearer secret'), false);
assert.equal(isImageProxyUrlCacheable(new URL('https://images.example.com/avatar.png?xsec_token=secret')), false);
assert.equal(isImageProxyUrlCacheable(new URL('https://images.example.com/avatar.png?X-Amz-Signature=secret')), false);
assert.notEqual(createImageProxyCacheKey(publicTarget, 'image/avif'), createImageProxyCacheKey(publicTarget, 'image/webp'));

assert.equal(imageProxyResponseCacheTtlMs(new Headers({ 'Cache-Control': 'public, max-age=60' }), 120_000), 60_000);
assert.equal(imageProxyResponseCacheTtlMs(new Headers({ 'Cache-Control': 'private, max-age=60' }), 120_000), 0);
assert.equal(imageProxyResponseCacheTtlMs(new Headers({ 'Set-Cookie': 'session=secret' }), 120_000), 0);
assert.equal(imageProxyCdnCacheTtlMs(120_000, 60_000), 60_000);
assert.equal(imageProxyCdnCacheTtlMs(120_000, 0), 0);
assert.equal(imageProxyResponseCacheControl(60_000), 'public, max-age=60, s-maxage=60');
assert.equal(imageProxyResponseCacheControl(0), 'private, no-store');

const cacheDirectory = await mkdtemp(join(tmpdir(), 'link-image-cache-'));
try {
  const cache = new ImageProxyCache(cacheDirectory, 10, 8);
  const firstKey = createImageProxyCacheKey(new URL('https://images.example.com/first.png'), 'image/*');
  const secondKey = createImageProxyCacheKey(new URL('https://images.example.com/second.png'), 'image/*');
  assert.equal(await cache.write(firstKey, Buffer.from('123456'), 'image/png', 60_000), true);
  const firstCached = await cache.read(firstKey);
  assert.equal(firstCached?.body.toString(), '123456');
  assert.ok((firstCached?.cacheTtlMs ?? 0) > 0);
  assert.equal(await cache.write(secondKey, Buffer.from('abcdef'), 'image/png', 60_000), true);
  assert.equal(await cache.read(firstKey), null);
  assert.equal((await cache.read(secondKey))?.body.toString(), 'abcdef');
  assert.equal(await cache.write(firstKey, Buffer.from('123456789'), 'image/png', 60_000), false);

  const expiredKey = createImageProxyCacheKey(new URL('https://images.example.com/expired.png'), 'image/*');
  assert.equal(await cache.write(expiredKey, Buffer.from('old'), 'image/png', 60_000), true);
  const expiredMetadataPath = join(cacheDirectory, `${expiredKey}.json`);
  await writeFile(expiredMetadataPath, JSON.stringify({ version: 1, contentType: 'image/png', createdAt: 1, expiresAt: 2, size: 3 }));
  assert.equal(await cache.read(expiredKey), null);
} finally {
  await rm(cacheDirectory, { recursive: true, force: true });
}

console.log('Image proxy cache regression checks passed.');