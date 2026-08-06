import type { MusicSource, MusicTrack } from '@/types/domain';
import { appApiFetch } from './appApi';

const musicApiEndpoint = 'https://music-api.gdstudio.xyz/api.php';
const textProxyPath = '/__text-proxy';
const playbackRepairSources: MusicSource[] = ['netease', 'kuwo', 'joox'];

interface RawMusicTrack {
  id?: string | number;
  name?: string;
  artist?: unknown;
  album?: string;
  pic_id?: string | number;
  url_id?: string | number;
  lyric_id?: string | number;
  source?: string;
}

function buildMusicApiUrl(params: Record<string, string | number>) {
  const url = new URL(musicApiEndpoint);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  return url.toString();
}

function isLocalProxyHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized.startsWith('192.168.')
    || normalized.startsWith('10.');
}

function canUseLocalTextProxy() {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  return isLocalProxyHostname(window.location.hostname) || window.location.port === '5173' || window.location.port === '4173';
}

function createMusicRequestUrl(url: string) {
  return canUseLocalTextProxy() ? `${textProxyPath}?url=${encodeURIComponent(url)}` : url;
}

async function fetchMusicJson(url: string) {
  const response = await appApiFetch(createMusicRequestUrl(url));
  if (!response.ok) throw new Error(`GD 音乐台请求失败：${response.status}`);
  return response.json();
}

function normalizeArtists(value: unknown) {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  const text = String(value ?? '').trim();
  return text ? text.split(/[、,/]/).map((entry) => entry.trim()).filter(Boolean) : [];
}

function toMusicTrack(raw: RawMusicTrack, fallbackSource: MusicSource): MusicTrack | null {
  const platformId = String(raw.id ?? '').trim();
  const source = String(raw.source ?? fallbackSource).trim() || fallbackSource;
  const name = String(raw.name ?? '').trim();
  if (!platformId || !name) return null;

  return {
    id: `${source}:${platformId}`,
    platformId,
    urlId: String(raw.url_id ?? platformId).trim(),
    source,
    name,
    artists: normalizeArtists(raw.artist),
    album: String(raw.album ?? '').trim(),
    picId: String(raw.pic_id ?? '').trim(),
    lyricId: String(raw.lyric_id ?? platformId).trim()
  };
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function extractAudioUrl(data: unknown): string {
  if (typeof data === 'string') return /^https?:\/\//i.test(data.trim()) ? data.trim() : '';
  if (!data || typeof data !== 'object') return '';
  if (Array.isArray(data)) {
    for (const entry of data) {
      const url = extractAudioUrl(entry);
      if (url) return url;
    }
    return '';
  }
  const record = data as Record<string, unknown>;
  for (const key of ['url', 'src', 'audio', 'play_url', 'playUrl', 'location']) {
    const value = record[key];
    if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
  }
  for (const key of ['data', 'result', 'song', 'info']) {
    const url = extractAudioUrl(record[key]);
    if (url) return url;
  }
  return '';
}

async function fetchDirectMusicAudioUrl(track: MusicTrack, br: number) {
  const ids = Array.from(new Set([track.urlId, track.platformId].filter(Boolean)));
  const bitrates = Array.from(new Set([br, 320, 192, 128].filter(Boolean)));
  for (const id of ids) {
    for (const bitrate of bitrates) {
      try {
        const data = await fetchMusicJson(buildMusicApiUrl({ types: 'url', source: track.source, id: id as string, br: bitrate }));
        const url = extractAudioUrl(data);
        if (url) return url;
      } catch {
        // Try the next id/bitrate candidate before falling back to a mirrored source.
      }
    }
  }
  return '';
}

function isLikelySameTrack(candidate: MusicTrack, track: MusicTrack) {
  const sameName = normalizeText(candidate.name) === normalizeText(track.name);
  const candidateArtists = candidate.artists.map(normalizeText);
  const trackArtists = track.artists.map(normalizeText);
  const sameArtist = !trackArtists.length || candidateArtists.some((artist) => trackArtists.includes(artist));
  return sameName && sameArtist;
}

function musicTrackSearchKeywords(track: MusicTrack) {
  return Array.from(new Set([
    [track.name, track.artists[0]].filter(Boolean).join(' '),
    [track.name, ...track.artists.slice(0, 2)].filter(Boolean).join(' '),
    track.name
  ].map((keyword) => keyword.trim()).filter(Boolean)));
}

function musicTrackRepairSources(track: MusicTrack) {
  const normalizedSource = String(track.source ?? '').trim() as MusicSource;
  return Array.from(new Set([
    playbackRepairSources.includes(normalizedSource) ? normalizedSource : '',
    ...playbackRepairSources
  ].filter(Boolean))) as MusicSource[];
}

async function fetchMirroredAudioUrl(track: MusicTrack, br: number) {
  if (track.source === 'netease') return '';
  const keywords = Array.from(new Set([
    [track.name, track.artists[0]].filter(Boolean).join(' '),
    track.name
  ].filter(Boolean)));
  const candidates: MusicTrack[] = [];
  for (const keyword of keywords) {
    try {
      candidates.push(...await searchMusicTracks(keyword, 'netease', 1, 8));
    } catch {
      // Try the next mirror keyword.
    }
  }
  const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [candidate.id, candidate])).values());
  const orderedCandidates = [
    ...uniqueCandidates.filter((candidate) => isLikelySameTrack(candidate, track)),
    ...uniqueCandidates.filter((candidate) => !isLikelySameTrack(candidate, track))
  ];
  for (const candidate of orderedCandidates) {
    const url = await fetchDirectMusicAudioUrl(candidate, br);
    if (url) return url;
  }
  return '';
}

export async function searchMusicTracks(keyword: string, source: MusicSource = 'netease', page = 1, count = 20) {
  const name = keyword.trim();
  if (!name) return [];
  const data = await fetchMusicJson(buildMusicApiUrl({ types: 'search', source, name, count, pages: page }));
  if (!Array.isArray(data)) return [];
  return data.map((entry) => toMusicTrack(entry as RawMusicTrack, source)).filter((entry): entry is MusicTrack => Boolean(entry));
}

export async function fetchMusicAudioUrl(track: MusicTrack, br = 320) {
  const url = await fetchDirectMusicAudioUrl(track, br) || await fetchMirroredAudioUrl(track, br);
  if (!url) throw new Error('歌曲暂无可播放地址。');
  return url;
}

export async function fetchMusicCoverUrl(track: MusicTrack, size = 300) {
  if (!track.picId) return '';
  const data = await fetchMusicJson(buildMusicApiUrl({ types: 'pic', source: track.source, id: track.picId, size }));
  return String(data?.url ?? '').trim();
}

async function withFreshMusicCover(track: MusicTrack) {
  if (!track.picId) return track;
  const coverUrl = track.coverUrl || await fetchMusicCoverUrl(track);
  return coverUrl ? mergeMusicTrack(track, { coverUrl }) : track;
}

async function fetchPlayableMusicTrackCandidate(track: MusicTrack) {
  const coveredTrack = await withFreshMusicCover(track);
  const audioUrl = await fetchMusicAudioUrl(coveredTrack);
  return mergeMusicTrack(coveredTrack, { audioUrl });
}

function mergeRepairedMusicTrack(originalTrack: MusicTrack, playableTrack: MusicTrack) {
  return mergeMusicTrack(originalTrack, {
    id: originalTrack.id || playableTrack.id,
    platformId: playableTrack.platformId,
    urlId: playableTrack.urlId,
    source: playableTrack.source,
    name: playableTrack.name || originalTrack.name,
    artists: playableTrack.artists.length ? playableTrack.artists : originalTrack.artists,
    album: playableTrack.album,
    picId: playableTrack.picId,
    lyricId: playableTrack.lyricId,
    coverUrl: playableTrack.coverUrl,
    audioUrl: playableTrack.audioUrl,
    duration: playableTrack.duration,
    addedAt: originalTrack.addedAt
  });
}

async function searchPlayableMusicTrackFallback(track: MusicTrack) {
  const candidates: MusicTrack[] = [];
  for (const source of musicTrackRepairSources(track)) {
    for (const keyword of musicTrackSearchKeywords(track)) {
      try {
        candidates.push(...await searchMusicTracks(keyword, source, 1, 8));
      } catch {
        // Try the next source/keyword pair.
      }
    }
  }
  const uniqueCandidates = Array.from(new Map(candidates.map((candidate) => [candidate.id, candidate])).values());
  const orderedCandidates = [
    ...uniqueCandidates.filter((candidate) => isLikelySameTrack(candidate, track)),
    ...uniqueCandidates.filter((candidate) => !isLikelySameTrack(candidate, track))
  ];
  for (const candidate of orderedCandidates) {
    try {
      return mergeRepairedMusicTrack(track, await fetchPlayableMusicTrackCandidate(candidate));
    } catch {
      // Try the next search candidate.
    }
  }
  return null;
}

export async function refreshPlayableMusicTrack(track: MusicTrack) {
  try {
    return await fetchPlayableMusicTrackCandidate(track);
  } catch (error) {
    const repairedTrack = await searchPlayableMusicTrackFallback(track);
    if (repairedTrack) return repairedTrack;
    throw error;
  }
}

export async function fetchMusicLyricText(track: MusicTrack) {
  const id = track.lyricId || track.platformId;
  if (!id) return '';
  const data = await fetchMusicJson(buildMusicApiUrl({ types: 'lyric', source: track.source, id }));
  if (typeof data === 'string') return data.trim();
  return String(data?.lyric ?? data?.lrc ?? data?.text ?? '').trim();
}

export function mergeMusicTrack(base: MusicTrack, patch: Partial<MusicTrack>): MusicTrack {
  return {
    ...base,
    ...patch,
    artists: patch.artists ?? base.artists,
    updatedAt: Date.now()
  };
}