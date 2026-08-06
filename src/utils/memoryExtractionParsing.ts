import { jsonrepair } from 'jsonrepair';
import { extractCompleteJsonObject, normalizeNarrativeText } from '@/utils/structuredText';

export interface MemoryParsingMetadata {
  repairedJson: boolean;
}

export function parseLooseMemoryJson(raw: string, metadata: MemoryParsingMetadata = { repairedJson: false }): Record<string, unknown> | null {
  const text = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const complete = extractCompleteJsonObject(text);
  const candidate = complete?.json || (start >= 0 ? text.slice(start, end > start ? end + 1 : undefined) : text);
  for (const source of [candidate, text]) {
    if (!source) continue;
    try {
      const value = JSON.parse(source) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {}
    try {
      const value = JSON.parse(jsonrepair(source)) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        metadata.repairedJson = true;
        return value as Record<string, unknown>;
      }
    } catch {}
  }
  return null;
}

export function fallbackMemoryNarrative(raw: string): string {
  const text = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!text) return '我记得这段对话。';
  const field = extractStringField(text, ['narrative', 'memory', 'summary', 'content']);
  if (field) return field;
  if (text.startsWith('{') || text.startsWith('[')) return '我记得这段对话。';
  return normalizeNarrativeText(text) || '我记得这段对话。';
}

function extractStringField(raw: string, fieldNames: string[]): string {
  const namePattern = fieldNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const match = String(raw ?? '').match(new RegExp(`"(?:${namePattern})"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`, 'i'));
  if (!match) return '';
  try {
    return normalizeNarrativeText(JSON.parse(`"${match[1]}"`));
  } catch {
    return normalizeNarrativeText(match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'));
  }
}