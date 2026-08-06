import type { ChatCoupleActivityAttachment, CoupleSpaceSnapshot, LifeLedgerEvent, LifeLedgerEventKind } from '@/types/domain';

const hiddenGuardianKinds = new Set<LifeLedgerEventKind>(['message-received', 'message-read', 'message-sent', 'voom-post', 'call-state']);
const visibleGuardianSources = new Set(['life-advance', 'system']);

export function isGuardianVisibleLifeEvent(event: LifeLedgerEvent) {
  if (hiddenGuardianKinds.has(event.kind)) return false;
  return visibleGuardianSources.has(event.source);
}

export function isGuardianVisibleAttachment(
  attachment: ChatCoupleActivityAttachment,
  resolvedEvents: LifeLedgerEvent[] = [],
  knownPartyNames: string[] = []
) {
  if (resolvedEvents.length) return resolvedEvents.some(isGuardianVisibleLifeEvent);
  if (attachment.kind && hiddenGuardianKinds.has(attachment.kind)) return false;
  if (attachment.source && !visibleGuardianSources.has(attachment.source)) return false;

  const text = `${attachment.title} ${attachment.summary}`;
  if (/已读(?:了)?(?:刚刚)?收到的消息|打开\s*LINK.*(?:回复|发出)|在\s*LINK.*(?:回复|发出)/i.test(text)) return false;
  return !knownPartyNames.some((name) => {
    const normalizedName = name.trim();
    return normalizedName && text.includes(normalizedName) && /发来(?:了)?(?:一条|新的?)?.*消息/.test(text);
  });
}

export function guardianEventKindLabel(kind?: LifeLedgerEventKind) {
  if (!kind) return '生活动态';
  return ({
    charge: '电量与充电',
    screen: '屏幕状态',
    app: 'App 使用',
    network: '网络状态',
    location: '位置变化',
    travel: '移动行程',
    notification: '手机通知',
    activity: '生活记录',
    'message-received': 'LINK 消息',
    'message-read': 'LINK 已读',
    'message-sent': 'LINK 回复',
    'voom-post': 'VOOM',
    'call-state': '通话'
  })[kind];
}

export function guardianEventIcon(kind?: LifeLedgerEventKind, explicitIcon = '') {
  if (explicitIcon.trim()) return explicitIcon.trim();
  if (!kind) return '✦';
  return ({
    charge: '⚡',
    screen: '◉',
    app: '▣',
    network: '⌁',
    location: '⌖',
    travel: '➜',
    notification: '●',
    activity: '✦',
    'message-received': '✦',
    'message-read': '◉',
    'message-sent': '↗',
    'voom-post': '◌',
    'call-state': '☎'
  })[kind];
}

export function guardianAttachmentFromEvent(
  event: LifeLedgerEvent,
  snapshotId: string,
  snapshot?: CoupleSpaceSnapshot
): ChatCoupleActivityAttachment {
  return {
    snapshotId,
    eventIds: [event.id],
    eventId: event.id,
    occurredAt: event.occurredAt,
    kind: event.kind,
    importance: event.importance,
    source: event.source,
    title: event.title,
    summary: event.summary,
    detail: event.detail,
    ...(event.detailBlocks?.length ? { detailBlocks: event.detailBlocks } : {}),
    icon: guardianEventIcon(event.kind, event.icon),
    eventCount: 1,
    ...(event.battery !== undefined ? { battery: event.battery } : {}),
    ...(event.charging !== undefined ? { charging: event.charging } : {}),
    ...(event.app ? { app: event.app } : {}),
    ...(event.location ? { place: event.location } : snapshot?.location.place ? { place: snapshot.location.place } : {})
  };
}

export function guardianEventHasDetail(attachment: ChatCoupleActivityAttachment) {
  return Boolean(
    attachment.detail?.trim()
    || attachment.eventIds.length
    || attachment.app
    || attachment.place
    || attachment.battery !== undefined
  );
}

export function formatGuardianEventTime(timestamp: number, now = Date.now()) {
  const eventDate = new Date(timestamp);
  const currentDate = new Date(now);
  const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate()).getTime();
  const currentDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()).getTime();
  const dayDifference = Math.round((currentDay - eventDay) / (24 * 60 * 60 * 1000));
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(eventDate);
  if (dayDifference === 0) return `今天 ${time}`;
  if (dayDifference === 1) return `昨天 ${time}`;
  return `${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(eventDate)} ${time}`;
}