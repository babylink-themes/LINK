import { isNativeImageSaveAvailable, saveNativeImage } from '@/services/nativeMedia';
import { appApiFetch } from '@/services/appApi';
import { dataUrlToBlob, isLocalMediaCacheUrl, resolveLocalMediaBlob } from '@/utils/mediaStorage';

function extensionFromMimeType(mimeType: string) {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('svg')) return 'svg';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  return '';
}

function extensionFromUrl(url: string) {
  const path = url.split('?')[0]?.split('#')[0] ?? '';
  const extension = path.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  return extension && ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'].includes(extension) ? extension : '';
}

function safeDownloadName(name: string) {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    || 'link-image';
}

function clickDownload(url: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function downloadDataUrl(dataUrl: string, fileName: string) {
  const blob = dataUrlToBlob(dataUrl);
  if (blob.type.startsWith('image/') && isNativeImageSaveAvailable()) {
    await saveNativeImage(blob, fileName);
    return;
  }
  clickDownload(dataUrl, fileName);
}

async function fetchImage(source: string) {
  try {
    const response = await fetch(source, { mode: 'cors' });
    if (response.ok) return response;
  } catch {
    // Retry remote images through the authenticated same-origin proxy.
  }
  if (/^https?:\/\//i.test(source)) {
    try {
      const response = await appApiFetch(`/__image-download?url=${encodeURIComponent(source)}`);
      if (response.ok) return response;
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      const detail = error instanceof Error && !/failed to fetch/i.test(error.message) ? `（${error.message}）` : '';
      throw new Error(`图片下载请求失败，请检查网络后重试${detail}。`);
    }
  }
  throw new Error('图片读取失败。');
}

function imageBlobWithFallbackType(blob: Blob, source: string) {
  if (blob.type.startsWith('image/')) return blob;
  const extension = extensionFromUrl(source);
  const mimeType = extension === 'png' ? 'image/png'
    : extension === 'webp' ? 'image/webp'
      : extension === 'gif' ? 'image/gif'
        : extension === 'svg' ? 'image/svg+xml'
          : ['jpg', 'jpeg'].includes(extension) ? 'image/jpeg' : '';
  if (!mimeType) throw new Error('读取到的文件不是有效图片。');
  return new Blob([blob], { type: mimeType });
}

async function saveOrDownloadImage(blob: Blob, source: string, baseName: string) {
  const imageBlob = imageBlobWithFallbackType(blob, source);
  const extension = extensionFromMimeType(imageBlob.type) || extensionFromUrl(source) || 'jpg';
  const fileName = `${baseName}.${extension}`;
  if (isNativeImageSaveAvailable()) {
    await saveNativeImage(imageBlob, fileName);
    return;
  }

  const objectUrl = URL.createObjectURL(imageBlob);
  try {
    clickDownload(objectUrl, fileName);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

export async function downloadImageUrl(source: string, filenameBase: string) {
  const imageUrl = source.trim();
  if (!imageUrl) throw new Error('没有可下载的图片。');
  const baseName = safeDownloadName(filenameBase);

  const localBlob = await resolveLocalMediaBlob(imageUrl);
  if (localBlob) {
    await saveOrDownloadImage(localBlob, imageUrl, baseName);
    return;
  }
  if (isLocalMediaCacheUrl(imageUrl)) throw new Error('本地图片文件已丢失，无法下载。');

  const response = await fetchImage(imageUrl);
  await saveOrDownloadImage(await response.blob(), imageUrl, baseName);
}
