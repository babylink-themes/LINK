import type { SmallTheaterTopic } from '@/types/domain';
import { createId } from './id';

export type SmallTheaterTopicDraft = Pick<SmallTheaterTopic, 'title' | 'prompt'>;

export async function loadDefaultSmallTheaterTopicDrafts() {
  const { defaultSmallTheaterTopicDrafts } = await import('./smallTheaterDefaults');
  return defaultSmallTheaterTopicDrafts as SmallTheaterTopicDraft[];
}

export async function createDefaultSmallTheaterTopics(charId: string, timestamp = Date.now()): Promise<SmallTheaterTopic[]> {
  const drafts = await loadDefaultSmallTheaterTopicDrafts();
  return drafts.map((draft, index) => ({
    id: createId('theater-topic'),
    charId,
    title: draft.title,
    prompt: draft.prompt,
    enabled: true,
    builtIn: true,
    createdAt: timestamp + index,
    updatedAt: timestamp + index
  }));
}

export function normalizeSmallTheaterTopic(topic: Partial<SmallTheaterTopic> | null | undefined, fallbackCharId = ''): SmallTheaterTopic | null {
  const charId = String(topic?.charId ?? fallbackCharId).trim();
  const title = String(topic?.title ?? '').trim();
  if (!charId || !title) return null;
  const now = Date.now();
  return {
    id: String(topic?.id ?? '').trim() || createId('theater-topic'),
    charId,
    title,
    prompt: String(topic?.prompt ?? '').trim(),
    enabled: topic?.enabled !== false,
    builtIn: Boolean(topic?.builtIn),
    createdAt: Math.max(0, Number(topic?.createdAt ?? now) || now),
    updatedAt: Math.max(0, Number(topic?.updatedAt ?? now) || now)
  };
}