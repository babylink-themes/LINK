import type { CharacterProfile, CoupleActivityCategory, CoupleLifeEvent, CoupleSpaceSnapshot, CoupleSpaceState, LifeLedger, LifeLedgerEvent, LifeLedgerEventKind, LifeLedgerEventSource } from '@/types/domain';
import { createId } from '@/utils/id';
import { normalizeCoupleLifeEvents, normalizeCoupleSpaceSnapshot, normalizeCoupleSpaceState } from '@/utils/coupleSpace';

const oneDayMs = 24 * 60 * 60 * 1000;
const activityCategories = new Set<CoupleActivityCategory>(['sleep', 'home', 'travel', 'work', 'meal', 'social', 'errand', 'leisure']);
const ledgerKinds = new Set<LifeLedgerEventKind>([
  'charge', 'screen', 'app', 'network', 'location', 'travel', 'notification', 'activity',
  'message-received', 'message-read', 'message-sent', 'voom-post', 'call-state'
]);
const ledgerSources = new Set<LifeLedgerEventSource>(['life-advance', 'private-chat', 'group-chat', 'voom', 'call', 'system']);

function text(value: unknown, fallback = '') {
  return String(value ?? '').trim() || fallback;
}

function timestamp(value: unknown, fallback: number) {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate > 0 ? Math.round(candidate) : fallback;
}

function timeLabel(value: number) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
}

function category(value: unknown): CoupleActivityCategory | undefined {
  const candidate = text(value) as CoupleActivityCategory;
  return activityCategories.has(candidate) ? candidate : undefined;
}

function eventSource(value: unknown): LifeLedgerEventSource {
  const candidate = text(value) as LifeLedgerEventSource;
  return ledgerSources.has(candidate) ? candidate : 'life-advance';
}

function eventKind(value: unknown): LifeLedgerEventKind {
  const candidate = text(value) as LifeLedgerEventKind;
  return ledgerKinds.has(candidate) ? candidate : 'activity';
}

function eventKey(event: LifeLedgerEvent) {
  return event.id || `${event.occurredAt}:${event.source}:${event.kind}:${event.title}`;
}

export function normalizeLifeLedgerEvent(input: unknown, fallbackAt = Date.now()): LifeLedgerEvent {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const occurredAt = timestamp(source.occurredAt, fallbackAt);
  const normalizedBase = normalizeCoupleLifeEvents([{ ...source, kind: 'activity', occurredAt }], occurredAt)[0] as CoupleLifeEvent;
  const next: LifeLedgerEvent = {
    ...normalizedBase,
    id: text(source.id, createId('life')),
    occurredAt,
    kind: eventKind(source.kind),
    source: eventSource(source.source),
    ...(text(source.conversationId) ? { conversationId: text(source.conversationId).slice(0, 120) } : {}),
    ...(text(source.messageId) ? { messageId: text(source.messageId).slice(0, 120) } : {}),
    ...(source.surface === 'online-chat' || source.surface === 'group-chat' || source.surface === 'voom' || source.surface === 'call' || source.surface === 'guardian' ? { surface: source.surface } : {}),
    ...(category(source.activityCategory) ? { activityCategory: category(source.activityCategory) } : {})
  };
  return next;
}

export function mergeLifeLedgerEvents(existing: LifeLedgerEvent[], incoming: LifeLedgerEvent[], now = Date.now()) {
  const byKey = new Map<string, LifeLedgerEvent>();
  for (const event of recentLifeLedgerEvents(existing, now)) byKey.set(eventKey(event), event);
  for (const event of recentLifeLedgerEvents(incoming, now)) {
    const key = eventKey(event);
    if (!byKey.has(key)) byKey.set(key, event);
  }
  return [...byKey.values()].sort((left, right) => left.occurredAt - right.occurredAt || left.id.localeCompare(right.id));
}

export function recentLifeLedgerEvents(events: LifeLedgerEvent[], now = Date.now()) {
  const cutoff = now - oneDayMs;
  return events.filter((event) => event.occurredAt >= cutoff && event.occurredAt <= now);
}

export function pruneLifeLedger(ledger: LifeLedger, now = Date.now()): LifeLedger | undefined {
  const cutoff = now - oneDayMs;
  const events = recentLifeLedgerEvents(ledger.events, now);
  const current = ledger.current && ledger.current.generatedAt >= cutoff && ledger.current.generatedAt <= now
    ? normalizeCoupleSpaceSnapshot(ledger.current, now)
    : undefined;
  if (!current && !events.length) return undefined;
  const lastAdvancedAt = ledger.lastAdvancedAt >= cutoff && ledger.lastAdvancedAt <= now ? ledger.lastAdvancedAt : 0;
  const { current: _current, ...ledgerWithoutCurrent } = ledger;
  return {
    ...ledgerWithoutCurrent,
    createdAt: Math.max(ledger.createdAt, cutoff),
    updatedAt: Math.min(now, Math.max(ledger.updatedAt, lastAdvancedAt, current?.generatedAt ?? 0, ...events.map((event) => event.occurredAt))),
    lastAdvancedAt,
    ...(current ? { current } : {}),
    events
  };
}

function legacyEvents(state: CoupleSpaceState | undefined) {
  return (state?.life.events ?? []).map((event) => normalizeLifeLedgerEvent({ ...event, source: 'life-advance', surface: 'guardian' }, event.occurredAt));
}

export function createLifeLedger(characterId: string, legacyCoupleSpace?: CoupleSpaceState | null, now = Date.now()): LifeLedger {
  const state = normalizeCoupleSpaceState(legacyCoupleSpace, now);
  const current = state?.snapshot ? normalizeCoupleSpaceSnapshot(state.snapshot) : undefined;
  const events = legacyEvents(state);
  const lastAdvancedAt = Math.max(state?.life.lastAdvancedAt ?? 0, current?.generatedAt ?? 0);
  return {
    id: createId('life-ledger'),
    characterId,
    createdAt: now,
    updatedAt: Math.max(now, lastAdvancedAt),
    lastAdvancedAt,
    contentAdvanceCount: 0,
    ...(current ? { current } : {}),
    events
  };
}

export function normalizeLifeLedger(input: unknown, characterId: string, legacyCoupleSpace?: CoupleSpaceState | null, now = Date.now()): LifeLedger {
  if (!input || typeof input !== 'object') {
    const created = createLifeLedger(characterId, legacyCoupleSpace, now);
    return pruneLifeLedger(created, now) ?? createLifeLedger(characterId, undefined, now);
  }
  const source = input as Record<string, unknown>;
  const legacy = normalizeCoupleSpaceState(legacyCoupleSpace);
  const cutoff = now - oneDayMs;
  const rawCurrent = source.current ? normalizeCoupleSpaceSnapshot(source.current, now) : legacy?.snapshot ? normalizeCoupleSpaceSnapshot(legacy.snapshot, now) : undefined;
  const current = rawCurrent && rawCurrent.generatedAt >= cutoff && rawCurrent.generatedAt <= now ? rawCurrent : undefined;
  const rawEvents = Array.isArray(source.events) ? source.events : legacyEvents(legacy);
  const events = mergeLifeLedgerEvents([], rawEvents.map((event) => normalizeLifeLedgerEvent(event, current?.generatedAt ?? now)), now);
  const createdAt = Math.max(timestamp(source.createdAt, current?.generatedAt ?? now), cutoff);
  const lastAdvancedAt = timestamp(source.lastAdvancedAt, current?.generatedAt ?? 0);
  const normalized = {
    id: text(source.id, createId('life-ledger')),
    characterId,
    createdAt,
    updatedAt: Math.min(now, Math.max(timestamp(source.updatedAt, createdAt), lastAdvancedAt, current?.generatedAt ?? 0)),
    lastAdvancedAt,
    contentAdvanceCount: Math.max(0, Math.floor(Number(source.contentAdvanceCount) || 0)),
    ...(current ? { current } : {}),
    events
  } satisfies LifeLedger;
  return pruneLifeLedger(normalized, now) ?? createLifeLedger(characterId, legacyCoupleSpace, now);
}

export function lifeLedgerForCharacter(character: CharacterProfile, now = Date.now()) {
  return normalizeLifeLedger(character.lifeLedger, character.id, character.coupleSpace, now);
}

function updateCurrentSnapshot(snapshot: CoupleSpaceSnapshot | undefined, event: LifeLedgerEvent) {
  if (!snapshot) return snapshot;
  const current = normalizeCoupleSpaceSnapshot(snapshot, event.occurredAt);
  const device = { ...current.device };
  const nowTime = timeLabel(event.occurredAt);
  const nextNotifications = [...device.notifications];

  if (event.kind === 'message-received') {
    nextNotifications.unshift({
      app: 'LINK',
      time: nowTime,
      title: event.title,
      preview: event.detail || event.summary,
      unread: true
    });
  }
  if (event.kind === 'message-read') {
    device.screenStatus = 'using';
    device.activeApp = 'LINK';
    device.lastUnlockedAt = nowTime;
    for (const notice of nextNotifications) {
      if (notice.app === 'LINK') notice.unread = false;
    }
  }
  if (event.kind === 'message-sent') {
    device.screenStatus = 'using';
    device.activeApp = 'LINK';
    device.lastUnlockedAt = nowTime;
    const usageIndex = device.appUsage.findIndex((entry) => entry.app === 'LINK');
    const usage = { app: 'LINK', minutes: 1, lastUsedAt: nowTime, detail: '回复了一条线上消息' };
    if (usageIndex >= 0) {
      const previous = device.appUsage[usageIndex]!;
      device.appUsage.splice(usageIndex, 1, { ...previous, minutes: Math.min(1440, previous.minutes + 1), lastUsedAt: nowTime, detail: usage.detail });
    } else {
      device.appUsage.unshift(usage);
    }
    device.usageMinutes = Math.min(1440, device.usageMinutes + 1);
  }
  if (event.kind === 'charge' && event.battery !== undefined) {
    device.battery = event.battery;
    device.charging = Boolean(event.charging);
  }
  if (event.kind === 'app' && event.app) device.activeApp = event.app;
  if (event.kind === 'screen') {
    if (/锁屏|放下|息屏/.test(`${event.title}${event.summary}`)) device.screenStatus = 'locked';
    if (/解锁|打开|使用/.test(`${event.title}${event.summary}`)) device.screenStatus = 'using';
  }
  if (event.kind === 'network' && event.detail) device.network = event.detail.slice(0, 60);

  return {
    ...current,
    generatedAt: Math.max(current.generatedAt, event.occurredAt),
    location: event.location ? { ...current.location, place: event.location } : current.location,
    device: { ...device, notifications: nextNotifications.slice(0, 24), appUsage: device.appUsage.slice(0, 16) }
  };
}

export function appendLifeLedgerEvents(ledger: LifeLedger, events: LifeLedgerEvent[], now = Date.now()) {
  const retainedEvents = recentLifeLedgerEvents(events, now);
  const appended = mergeLifeLedgerEvents(ledger.events, retainedEvents, now);
  const added = retainedEvents.filter((event) => !ledger.events.some((existing) => eventKey(existing) === eventKey(event)));
  const current = added.reduce((snapshot, event) => updateCurrentSnapshot(snapshot, event), ledger.current);
  const updatedAt = Math.min(now, Math.max(ledger.updatedAt, ...added.map((event) => event.occurredAt), now));
  return pruneLifeLedger({ ...ledger, updatedAt, ...(current ? { current } : {}), events: appended }, now) ?? createLifeLedger(ledger.characterId, undefined, now);
}

function routeFromEvents(events: LifeLedgerEvent[], now: number) {
  const routeEvents = recentLifeLedgerEvents(events, now)
    .filter((event) => Boolean(event.location) && ['location', 'travel', 'activity'].includes(event.kind))
    .sort((left, right) => left.occurredAt - right.occurredAt);
  const route: CoupleSpaceSnapshot['location']['route'] = [];
  for (const event of routeEvents) {
    const place = event.location!;
    const previous = route.at(-1);
    const time = timeLabel(event.occurredAt);
    if (previous && previous.name === place) {
      previous.endTime = time;
      previous.detail = event.detail || event.summary || previous.detail;
      continue;
    }
    route.push({
      name: place,
      time,
      endTime: time,
      kind: event.kind === 'travel' ? 'pass' : route.length ? 'stay' : 'start',
      category: event.activityCategory ?? (event.kind === 'travel' ? 'travel' : 'leisure'),
      detail: event.detail || event.summary,
      companion: '未知',
      trace: event.title,
      privateThought: ''
    });
  }
  if (route.length) route[route.length - 1]!.kind = 'arrival';
  return route.slice(-12);
}

export function projectLifeLedgerSnapshot(ledger: LifeLedger, now = Date.now()) {
  if (!ledger.current || ledger.current.generatedAt < now - oneDayMs || ledger.current.generatedAt > now) return undefined;
  const snapshot = normalizeCoupleSpaceSnapshot(ledger.current, now);
  const route = routeFromEvents(ledger.events, now);
  return {
    ...snapshot,
    generatedAt: Math.max(snapshot.generatedAt, ledger.updatedAt),
    location: { ...snapshot.location, route }
  };
}
