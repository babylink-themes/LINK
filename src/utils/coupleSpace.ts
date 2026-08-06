import type { CoupleActivityCategory, CoupleAppUsageRecord, CoupleDeviceScreenStatus, CoupleFootprintRecord, CoupleGalleryRecord, CoupleLifeEvent, CoupleLifeEventImportance, CoupleLifeEventKind, CoupleLifeRecord, CoupleLifeState, CoupleLifeUpdate, CoupleMomentRecord, CoupleNetworkRecord, CoupleNoteRecord, CoupleNotificationRecord, CouplePhoneChatMessage, CouplePhoneChatRecord, CoupleRouteStop, CoupleSpaceSnapshot, CoupleSpaceState, CoupleWishNote, GuardianEventDetailBlock } from '@/types/domain';

const routeKinds = new Set<CoupleRouteStop['kind']>(['start', 'pass', 'stay', 'arrival']);
const activityCategories = new Set<CoupleActivityCategory>(['sleep', 'home', 'travel', 'work', 'meal', 'social', 'errand', 'leisure']);
const networkKinds = new Set<CoupleNetworkRecord['kind']>(['wifi', 'cellular', 'offline']);
const screenStatuses = new Set<CoupleDeviceScreenStatus>(['using', 'locked', 'idle']);
const footprintKinds = new Set<CoupleFootprintRecord['kind']>(['search', 'browser', 'map', 'shopping']);
const lifeRecordKinds = new Set<CoupleLifeRecord['kind']>(['alarm', 'calendar', 'order', 'music', 'draft']);
const phoneChatSenders = new Set(['character', 'contact']);
const lifeEventKinds = new Set<CoupleLifeEventKind>(['charge', 'screen', 'app', 'network', 'location', 'travel', 'notification', 'activity']);
const lifeEventImportances = new Set<CoupleLifeEventImportance>(['quiet', 'notice', 'highlight']);
const fallbackGalleryPalettes: Array<[string, string]> = [
  ['#fbd3e1', '#d8cff8'],
  ['#ccece2', '#d7e4f8'],
  ['#ffe0c9', '#f6cbd8'],
  ['#d7dcfb', '#c9edf0']
];

function text(value: unknown, fallback = '') {
  return String(value ?? '').trim() || fallback;
}

function rawText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function limitedText(value: unknown, fallback = '', maximum = 240) {
  return text(value, fallback).slice(0, maximum);
}

function numberInRange(value: unknown, minimum: number, maximum: number, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(maximum, Math.max(minimum, Math.round(numeric))) : fallback;
}

function normalizeRoute(input: unknown): CoupleRouteStop[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 12).map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const rawKind = text(record.kind) as CoupleRouteStop['kind'];
    const rawCategory = text(record.category) as CoupleActivityCategory;
    return {
      name: limitedText(record.name, `途经点 ${index + 1}`, 40),
      time: limitedText(record.time, '--:--', 12),
      endTime: limitedText(record.endTime, '', 12),
      kind: routeKinds.has(rawKind) ? rawKind : index === 0 ? 'start' : 'pass',
      category: activityCategories.has(rawCategory) ? rawCategory : 'leisure',
      detail: limitedText(record.detail, '轻轻经过这里', 260),
      companion: limitedText(record.companion, '独自一人', 50),
      trace: limitedText(record.trace, '没有留下特别痕迹', 120),
      privateThought: limitedText(record.privateThought, '', 180)
    };
  });
}

function normalizeNetworks(input: unknown): CoupleNetworkRecord[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 8).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const rawKind = text(record.kind) as CoupleNetworkRecord['kind'];
    return {
      name: limitedText(record.name, '未知网络', 60),
      time: limitedText(record.time, '--:--', 12),
      kind: networkKinds.has(rawKind) ? rawKind : 'wifi'
    };
  });
}

function normalizeMoments(input: unknown): CoupleMomentRecord[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 10).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      time: limitedText(record.time, '--:--', 12),
      category: limitedText(record.category, '生活切片', 20),
      title: limitedText(record.title, '一个普通瞬间', 60),
      detail: limitedText(record.detail, '今天也在好好生活。', 300),
      emoji: limitedText(record.emoji, '✨', 4),
      unspoken: limitedText(record.unspoken, '', 220)
    };
  });
}

function normalizeAppUsage(input: unknown): CoupleAppUsageRecord[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 10).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      app: limitedText(record.app, '未命名应用', 30),
      minutes: numberInRange(record.minutes, 0, 1440, 0),
      lastUsedAt: limitedText(record.lastUsedAt, '--:--', 12),
      detail: limitedText(record.detail, '短暂打开了一会儿', 160)
    };
  });
}

function normalizeNotifications(input: unknown): CoupleNotificationRecord[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 12).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      app: limitedText(record.app, '系统', 30),
      time: limitedText(record.time, '--:--', 12),
      title: limitedText(record.title, '一条新通知', 70),
      preview: limitedText(record.preview, '通知内容已收起', 180),
      unread: Boolean(record.unread)
    };
  });
}

function normalizePhoneChats(input: unknown): CouplePhoneChatRecord[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 8).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const messages = normalizePhoneChatMessages(record.messages);
    return {
      contact: limitedText(record.contact, '未命名联系人', 40),
      relation: limitedText(record.relation, '联系人', 30),
      avatarEmoji: limitedText(record.avatarEmoji, '💬', 4),
      updatedAt: limitedText(record.updatedAt, '--:--', 12),
      unread: numberInRange(record.unread, 0, 99, 0),
      summary: limitedText(record.summary, '聊了一些生活里的小事。', 600),
      messages
    };
  });
}

function normalizePhoneChatMessages(input: unknown): CouplePhoneChatMessage[] {
  if (!Array.isArray(input)) return [];
  return input.map((message) => {
    const messageRecord = message && typeof message === 'object' ? message as Record<string, unknown> : {};
    const rawSender = rawText(messageRecord.sender);
    return {
      sender: phoneChatSenders.has(rawSender) ? rawSender as 'character' | 'contact' : 'contact',
      time: rawText(messageRecord.time),
      text: rawText(messageRecord.text)
    };
  }).filter((message) => message.text);
}

function normalizeEventDetailBlocks(input: unknown): GuardianEventDetailBlock[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((item): GuardianEventDetailBlock[] => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const type = rawText(record.type);
    if (type === 'text') {
      const label = rawText(record.label);
      const content = rawText(record.content);
      return label && content ? [{ type: 'text', label, content }] : [];
    }
    if (type === 'note') {
      const folder = rawText(record.folder);
      const title = rawText(record.title);
      const content = rawText(record.content);
      const updatedAt = rawText(record.updatedAt);
      return folder && title && content && updatedAt ? [{
        type: 'note',
        folder,
        title,
        content,
        updatedAt,
        pinned: Boolean(record.pinned)
      }] : [];
    }
    if (type === 'conversation') {
      const messages = normalizePhoneChatMessages(record.messages);
      const contact = rawText(record.contact);
      const relation = rawText(record.relation);
      return contact && relation && messages.length ? [{
        type: 'conversation',
        contact,
        relation,
        summary: rawText(record.summary),
        messages
      }] : [];
    }
    if (type === 'fields' && Array.isArray(record.fields)) {
      const title = rawText(record.title);
      const fields = record.fields.flatMap((field) => {
        const fieldRecord = field && typeof field === 'object' ? field as Record<string, unknown> : {};
        const label = rawText(fieldRecord.label);
        const value = rawText(fieldRecord.value);
        return label && value ? [{ label, value }] : [];
      });
      return title && fields.length ? [{ type: 'fields', title, fields }] : [];
    }
    return [];
  });
}

function normalizeFootprints(input: unknown): CoupleFootprintRecord[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 12).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const rawKind = limitedText(record.kind) as CoupleFootprintRecord['kind'];
    return {
      kind: footprintKinds.has(rawKind) ? rawKind : 'search',
      time: limitedText(record.time, '--:--', 12),
      title: limitedText(record.title, '一条浏览记录', 90),
      detail: limitedText(record.detail, '随手点开看了一会儿。', 700),
      reason: limitedText(record.reason, '一时好奇', 400)
    };
  });
}

function normalizePalette(input: unknown, index: number): [string, string] {
  const fallback = fallbackGalleryPalettes[index % fallbackGalleryPalettes.length] ?? fallbackGalleryPalettes[0]!;
  if (!Array.isArray(input)) return fallback;
  const colors = input.slice(0, 2).map((color) => limitedText(color).toLowerCase());
  if (colors.length !== 2 || colors.some((color) => !/^#[0-9a-f]{6}$/.test(color))) return fallback;
  return [colors[0]!, colors[1]!];
}

function normalizeGallery(input: unknown): CoupleGalleryRecord[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 9).map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      time: limitedText(record.time, '--:--', 12),
      title: limitedText(record.title, '没有发出的照片', 70),
      detail: limitedText(record.detail, '角色把这个瞬间留在了相册里。', 700),
      emoji: limitedText(record.emoji, '📷', 4),
      palette: normalizePalette(record.palette, index)
    };
  });
}

function normalizeNotes(input: unknown): CoupleNoteRecord[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 8).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      folder: limitedText(record.folder, '备忘录', 30),
      title: limitedText(record.title, '未命名备忘', 70),
      content: limitedText(record.content, '暂时没有写下更多内容。', 2400),
      updatedAt: limitedText(record.updatedAt, '--:--', 12),
      pinned: Boolean(record.pinned)
    };
  });
}

function normalizeLifeRecords(input: unknown): CoupleLifeRecord[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 12).map((item) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const rawKind = limitedText(record.kind) as CoupleLifeRecord['kind'];
    return {
      kind: lifeRecordKinds.has(rawKind) ? rawKind : 'calendar',
      time: limitedText(record.time, '--:--', 12),
      title: limitedText(record.title, '一条生活记录', 80),
      detail: limitedText(record.detail, '角色手机里留下的一点生活安排。', 900),
      status: limitedText(record.status, '待处理', 30)
    };
  });
}

function normalizeKeywords(input: unknown) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map((item) => limitedText(item, '', 16)).filter(Boolean))].slice(0, 6);
}

export function normalizeCoupleSpaceSnapshot(input: unknown, generatedAt = Date.now()): CoupleSpaceSnapshot {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const location = source.location && typeof source.location === 'object' ? source.location as Record<string, unknown> : {};
  const device = source.device && typeof source.device === 'object' ? source.device as Record<string, unknown> : {};
  const bond = source.bond && typeof source.bond === 'object' ? source.bond as Record<string, unknown> : {};
  const rawScreenStatus = text(device.screenStatus) as CoupleDeviceScreenStatus;
  return {
    id: text(source.id, `couple_snapshot_${generatedAt}_${Math.random().toString(16).slice(2)}`),
    generatedAt: Number.isFinite(source.generatedAt) ? Number(source.generatedAt) : generatedAt,
    location: {
      place: limitedText(location.place, '角色的小世界', 60),
      address: limitedText(location.address, '一个只在故事里亮起的坐标', 140),
      status: limitedText(location.status, '正在好好生活', 260),
      distance: limitedText(location.distance, '心的距离很近', 80),
      transport: limitedText(location.transport, '散步', 40),
      eta: limitedText(location.eta, '等下一次见面', 60),
      stayMinutes: numberInRange(location.stayMinutes, 0, 1440, 0),
      route: normalizeRoute(location.route)
    },
    device: {
      battery: numberInRange(device.battery, 0, 100, 76),
      charging: Boolean(device.charging),
      screenStatus: screenStatuses.has(rawScreenStatus) ? rawScreenStatus : 'idle',
      lastUnlockedAt: limitedText(device.lastUnlockedAt, '--:--', 12),
      lastLockedAt: limitedText(device.lastLockedAt, '--:--', 12),
      usageMinutes: numberInRange(device.usageMinutes, 0, 1440, 0),
      activeApp: limitedText(device.activeApp, '没有正在使用的应用', 60),
      network: limitedText(device.network, '未分享网络', 60),
      networkHistory: normalizeNetworks(device.networkHistory),
      appUsage: normalizeAppUsage(device.appUsage),
      notifications: normalizeNotifications(device.notifications),
      chats: normalizePhoneChats(device.chats),
      footprints: normalizeFootprints(device.footprints),
      gallery: normalizeGallery(device.gallery),
      notes: normalizeNotes(device.notes),
      lifeRecords: normalizeLifeRecords(device.lifeRecords)
    },
    bond: {
      mood: limitedText(bond.mood, '平静', 40),
      moodEmoji: limitedText(bond.moodEmoji, '💗', 4),
      missLevel: numberInRange(bond.missLevel, 0, 100, 50),
      syncScore: numberInRange(bond.syncScore, 0, 100, 70),
      nextPlan: limitedText(bond.nextPlan, '找一个舒服的时间聊聊天', 180),
      whisper: limitedText(bond.whisper, '今天也想和你分享一点小事。', 260),
      daySummary: limitedText(bond.daySummary, '这 24 小时里有忙碌，也有一些没有出现在聊天框里的小事。', 420),
      hiddenThought: limitedText(bond.hiddenThought, '有些想念被留在了没有发送的那一刻。', 260),
      keywords: normalizeKeywords(bond.keywords)
    },
    moments: normalizeMoments(source.moments)
  };
}

export function normalizeCoupleLifeEvents(input: unknown, generatedAt = Date.now()): CoupleLifeEvent[] {
  if (!Array.isArray(input)) return [];
  return input.map((item, index) => {
    const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const rawKind = text(record.kind) as CoupleLifeEventKind;
    const rawImportance = text(record.importance) as CoupleLifeEventImportance;
    const rawOccurredAt = Number(record.occurredAt);
    const rawOffsetMinutes = Number(record.offsetMinutes);
    const detailBlocks = normalizeEventDetailBlocks(record.detailBlocks);
    const occurredAt = Number.isFinite(rawOccurredAt)
      ? Math.min(generatedAt, Math.round(rawOccurredAt))
      : Number.isFinite(rawOffsetMinutes)
        ? Math.min(generatedAt, Math.max(generatedAt - 24 * 60 * 60 * 1000, generatedAt + Math.round(rawOffsetMinutes) * 60 * 1000))
        : generatedAt - Math.max(0, input.length - index - 1) * 1000;
    return {
      id: text(record.id, `couple_life_${occurredAt}_${index}_${Math.random().toString(16).slice(2)}`),
      occurredAt,
      kind: lifeEventKinds.has(rawKind) ? rawKind : 'activity',
      importance: lifeEventImportances.has(rawImportance) ? rawImportance : 'notice',
      title: rawText(record.title),
      summary: rawText(record.summary),
      detail: rawText(record.detail),
      icon: rawText(record.icon),
      ...(detailBlocks.length ? { detailBlocks } : {}),
      ...(Number.isFinite(Number(record.battery)) ? { battery: numberInRange(record.battery, 0, 100, 0) } : {}),
      ...(typeof record.charging === 'boolean' ? { charging: record.charging } : {}),
      ...(text(record.app) ? { app: limitedText(record.app, '', 60) } : {}),
      ...(text(record.location) ? { location: limitedText(record.location, '', 80) } : {}),
      ...(activityCategories.has(text(record.activityCategory) as CoupleActivityCategory) ? { activityCategory: text(record.activityCategory) as CoupleActivityCategory } : {})
    };
  }).sort((first, second) => first.occurredAt - second.occurredAt);
}

export function mergeCoupleLifeEvents(existing: CoupleLifeEvent[], incoming: CoupleLifeEvent[], now = Date.now()) {
  const earliest = now - 24 * 60 * 60 * 1000;
  const eventByKey = new Map<string, CoupleLifeEvent>();
  for (const event of [...existing, ...incoming]) {
    if (!event || event.occurredAt < earliest) continue;
    const key = event.id || `${event.occurredAt}:${event.kind}:${event.title}`;
    eventByKey.set(key, event);
  }
  return [...eventByKey.values()]
    .sort((first, second) => first.occurredAt - second.occurredAt)
    .slice(-360);
}

export function normalizeCoupleLifeUpdate(input: unknown, generatedAt = Date.now()): CoupleLifeUpdate {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const snapshotSource = source.snapshot && typeof source.snapshot === 'object' ? source.snapshot : source;
  return {
    snapshot: normalizeCoupleSpaceSnapshot(snapshotSource, generatedAt),
    events: normalizeCoupleLifeEvents(source.events, generatedAt)
  };
}

function normalizeWishes(input: unknown, now: number): CoupleWishNote[] {
  if (!Array.isArray(input)) return [];
  return input.slice(-20).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const content = text(record.content).slice(0, 120);
    if (!content) return [];
    const createdAt = Number.isFinite(record.createdAt) ? Number(record.createdAt) : now;
    if (createdAt < now - 24 * 60 * 60 * 1000 || createdAt > now) return [];
    return [{
      id: text(record.id, `couple_wish_${Math.random().toString(16).slice(2)}`),
      content,
      createdAt
    }];
  });
}

function normalizeLifeState(input: unknown, snapshot: CoupleSpaceSnapshot | undefined, now: number): CoupleLifeState {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const lastAdvancedAt = Number(source.lastAdvancedAt);
  const eventGeneratedAt = now;
  return {
    lastAdvancedAt: Number.isFinite(lastAdvancedAt) && lastAdvancedAt >= now - 24 * 60 * 60 * 1000 && lastAdvancedAt <= now ? Math.round(lastAdvancedAt) : 0,
    ...(text(source.lastConversationId) ? { lastConversationId: limitedText(source.lastConversationId, '', 120) } : {}),
    events: mergeCoupleLifeEvents([], normalizeCoupleLifeEvents(source.events, eventGeneratedAt), eventGeneratedAt)
  };
}

export function normalizeCoupleSpaceState(input: Partial<CoupleSpaceState> | null | undefined, now = Date.now()): CoupleSpaceState | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const cutoff = now - 24 * 60 * 60 * 1000;
  const rawSnapshot = input.snapshot ? normalizeCoupleSpaceSnapshot(input.snapshot, now) : undefined;
  const snapshot = rawSnapshot && rawSnapshot.generatedAt >= cutoff && rawSnapshot.generatedAt <= now ? rawSnapshot : undefined;
  const history = Array.isArray(input.history)
    ? input.history.map((item) => normalizeCoupleSpaceSnapshot(item, now)).filter((item) => item.generatedAt >= cutoff && item.generatedAt <= now && item.id !== snapshot?.id).slice(0, 11)
    : [];
  const enabled = input.enabled !== false && input.activityFeedEnabled !== false;
  return {
    consentGrantedAt: Math.max(0, Number(input.consentGrantedAt) || 0),
    relationshipLabel: text(input.relationshipLabel, '恋人'),
    startedAt: text(input.startedAt),
    arrivalReminderEnabled: Boolean(input.arrivalReminderEnabled),
    enabled,
    activityFeedEnabled: enabled,
    ...(snapshot ? { snapshot } : {}),
    history,
    wishes: normalizeWishes(input.wishes, now),
    life: normalizeLifeState(input.life, snapshot, now)
  };
}

export function createCoupleSpaceState(): CoupleSpaceState {
  return {
    consentGrantedAt: Date.now(),
    relationshipLabel: '恋人',
    startedAt: '',
    arrivalReminderEnabled: false,
    enabled: true,
    activityFeedEnabled: true,
    history: [],
    wishes: [],
    life: {
      lastAdvancedAt: 0,
      events: []
    }
  };
}