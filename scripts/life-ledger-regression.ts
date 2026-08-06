import assert from 'node:assert/strict';
import type { CoupleSpaceSnapshot, LifeLedgerEvent } from '../src/types/domain.ts';
import { guardianAttachmentFromEvent, isGuardianVisibleLifeEvent } from '../src/utils/coupleGuardianEvents.ts';
import { assertCompleteLifeLedgerEventPayload, normalizeLifeLedgerAdvancePayload } from '../src/utils/lifeLedgerGeneratedOutput.ts';
import { appendLifeLedgerEvents, createCurrentLifeLedgerEvent, lifeLedgerForCharacter, normalizeLifeLedger, normalizeLifeLedgerEvent, projectLifeLedgerSnapshot, recentLifeLedgerEvents } from '../src/utils/lifeLedger.ts';
import { normalizeCoupleSpaceState } from '../src/utils/coupleSpace.ts';

const now = Date.UTC(2026, 7, 5, 12, 0, 0);

const snapshot: CoupleSpaceSnapshot = {
  id: 'snapshot-current',
  generatedAt: now - 60_000,
  location: {
    place: '工作室',
    address: '二楼靠窗的位置',
    status: '整理设计稿',
    distance: '不远',
    transport: '步行',
    eta: '下一个安排后',
    stayMinutes: 45,
    route: [{ name: '模型旧路线', time: '08:00', endTime: '09:00', kind: 'stay', category: 'work', detail: '不应作为路线来源', companion: '独自一人', trace: '', privateThought: '' }]
  },
  device: {
    battery: 64,
    charging: false,
    screenStatus: 'locked',
    lastUnlockedAt: '11:33',
    lastLockedAt: '11:34',
    usageMinutes: 128,
    activeApp: '没有正在使用的应用',
    network: '工作室 Wi-Fi',
    networkHistory: [],
    appUsage: [],
    notifications: [],
    chats: [],
    footprints: [],
    gallery: [],
    notes: [],
    lifeRecords: []
  },
  bond: {
    mood: '专注', moodEmoji: '🪄', missLevel: 48, syncScore: 72,
    nextPlan: '晚些时候散步', whisper: '', daySummary: '', hiddenThought: '', keywords: []
  },
  moments: []
};

const commute: LifeLedgerEvent = normalizeLifeLedgerEvent({
  id: 'commute', occurredAt: now - 95 * 60_000, kind: 'travel', source: 'life-advance', importance: 'notice',
  title: '到达工作室', summary: '从地铁站步行到工作室。', detail: '带着咖啡进门。',
  detailBlocks: [{ type: 'fields', title: '出行记录', fields: [{ label: '同行', value: '独自一人' }, { label: '随身物品', value: '咖啡与电脑' }] }],
  icon: '↝', location: '工作室', activityCategory: 'work'
}, now);
const lunch: LifeLedgerEvent = normalizeLifeLedgerEvent({
  id: 'lunch', occurredAt: now - 25 * 60_000, kind: 'location', source: 'life-advance', importance: 'notice',
  title: '在楼下吃午饭', summary: '午休来到楼下的小店。', detail: '点了热汤面。', icon: '⌖', location: '楼下小店', activityCategory: 'meal'
}, now);
const expiredEvent: LifeLedgerEvent = normalizeLifeLedgerEvent({
  id: 'expired', occurredAt: now - 24 * 60 * 60_000 - 1, kind: 'location', source: 'life-advance', importance: 'notice',
  title: '过期的旧记录', summary: '不应继续保存在情侣守护中。', detail: '这条记录会在归一化时删除。', icon: '⌖', location: '旧地点'
}, now);

const ledger = normalizeLifeLedger({
  id: 'ledger-1', characterId: '20001', createdAt: now - 2 * 60 * 60_000, updatedAt: now - 60_000,
  lastAdvancedAt: now - 60_000, current: snapshot, events: [expiredEvent, commute, lunch]
}, '20001');

assert.equal(ledger.events.length, 2, '过期账本事件不应继续保存在情侣守护中');
assert.deepEqual(recentLifeLedgerEvents(ledger.events, now).map((event) => event.id), ['commute', 'lunch']);
const projectedRoute = projectLifeLedgerSnapshot(ledger, now)?.location.route ?? [];
assert.deepEqual(projectedRoute.map((stop) => stop.name), ['工作室', '楼下小店']);
assert.equal(projectedRoute[0]?.category, 'work');
assert.equal(projectedRoute[1]?.kind, 'arrival');
assert.notEqual(projectedRoute[0]?.name, '模型旧路线');

const notification = normalizeLifeLedgerEvent({
  id: 'message-1', occurredAt: now, kind: 'message-received', source: 'private-chat', conversationId: 'conv-1', messageId: 'msg-1',
  surface: 'online-chat', importance: 'notice', title: '小面包 发来一条 LINK 消息', summary: '收到一条新消息。', detail: '中午吃什么？', icon: '✦', app: 'LINK'
}, now);
const afterNotification = appendLifeLedgerEvents(ledger, [notification]);
assert.equal(afterNotification.events.length, 3);
assert.equal(projectLifeLedgerSnapshot(afterNotification, now)?.device.notifications[0]?.app, 'LINK');
assert.equal(projectLifeLedgerSnapshot(afterNotification, now)?.device.notifications[0]?.unread, true);

const read = normalizeLifeLedgerEvent({
  id: 'read-1', occurredAt: now + 1_000, kind: 'message-read', source: 'private-chat', conversationId: 'conv-1', messageId: 'msg-1',
  surface: 'online-chat', importance: 'notice', title: '打开 LINK 查看消息', summary: '已读消息。', detail: '', icon: '◉', app: 'LINK'
}, now + 1_000);
const afterRead = appendLifeLedgerEvents(afterNotification, [read, { ...notification, summary: '不得重写既有事件' }]);
const afterReadSnapshot = projectLifeLedgerSnapshot(afterRead, now + 1_000);
assert.equal(afterRead.events.length, 4, '同一事件 ID 不能改写或重复追加');
assert.equal(afterRead.events.find((event) => event.id === 'message-1')?.summary, '收到一条新消息。');
assert.equal(afterReadSnapshot?.device.screenStatus, 'using');
assert.equal(afterReadSnapshot?.device.activeApp, 'LINK');
assert.equal(afterReadSnapshot?.device.notifications[0]?.unread, false);
assert.equal(isGuardianVisibleLifeEvent(notification), false, '用户发来的当前聊天消息不能投影为守护楼层');
assert.equal(isGuardianVisibleLifeEvent(read), false, '当前聊天已读事件不能投影为守护楼层');
assert.equal(isGuardianVisibleLifeEvent(commute), true, '角色未知的外部生活变化应投影为守护楼层');

const commuteAttachment = guardianAttachmentFromEvent(commute, snapshot.id, snapshot);
assert.equal(commuteAttachment.eventIds.length, 1, '每个守护楼层只能对应一条事件');
assert.equal(commuteAttachment.detail, commute.detail, '单条详情必须保留事件具体内容');
assert.equal(commuteAttachment.detailBlocks?.[0]?.type, 'fields', '单条详情必须保留完整记录区块');

const rawDetail = '不应被截断的完整原始记录。'.repeat(240);
const untruncated = normalizeLifeLedgerEvent({
  id: 'untruncated', occurredAt: now, kind: 'activity', source: 'life-advance', importance: 'notice',
  title: '保留完整详情', summary: '验证本地不截断模型原文。', detail: rawDetail, icon: '✦',
  detailBlocks: [{ type: 'text', label: '原始记录', content: rawDetail }]
}, now);
assert.equal(untruncated.detail, rawDetail, '事件正文不能被本地截断');
assert.equal(untruncated.detailBlocks?.[0]?.type === 'text' ? untruncated.detailBlocks[0].content : '', rawDetail, '详情区块不能被本地截断');

const completeGeneratedPayload = {
  events: [{
    title: '同事私聊确认排期', summary: '与同事确认了明天的设计评审。', detail: '下班前收到了同事的排期确认。角色逐条核对了文件版本和会议时间。最后把确认事项记进日历。',
    detailBlocks: [{
      type: 'conversation', contact: '程舟', relation: '项目同事', summary: '确认设计评审安排。', messages: [
        { sender: 'contact', time: '18:01', text: '明天十点的评审可以照常进行吗？' },
        { sender: 'character', time: '18:02', text: '可以，我会在九点半前发最终稿。' },
        { sender: 'contact', time: '18:03', text: '好的，我已经预留了会议室。' },
        { sender: 'character', time: '18:04', text: '收到，我把版本号和参会人再核对一次。' }
      ]
    }]
  }]
};
assert.doesNotThrow(() => assertCompleteLifeLedgerEventPayload(completeGeneratedPayload));
assert.doesNotThrow(() => assertCompleteLifeLedgerEventPayload({ events: [{ title: '正常事件', summary: '带有摘要。', detail: '模型给出了完整经过，但没有扩展详情区块。' }] }));
assert.throws(
  () => assertCompleteLifeLedgerEventPayload({ events: [{ ...completeGeneratedPayload.events[0], detailBlocks: [{ type: 'fields', title: '元数据', fields: [{ label: '来源', value: '日历' }] }] }] }),
  /详情区块只有元数据/
);

const snapshotOnlyAdvancePayload = normalizeLifeLedgerAdvancePayload({
  currentSnapshot: {
    location: { place: '河边咖啡馆', status: '靠窗整理明天要用的资料' },
    device: { battery: 58, charging: false, activeApp: '备忘录', network: '咖啡馆 Wi-Fi' },
    bond: { mood: '放松', nextPlan: '买一束花再回家' }
  }
}) as { snapshot: Record<string, unknown>; events: Array<Record<string, unknown>> };
assert.equal(snapshotOnlyAdvancePayload.events.length, 1, '模型仅返回当前未知状态时应自动生成一条生活事件');
assert.equal(snapshotOnlyAdvancePayload.events[0]?.location, '河边咖啡馆');
assert.match(String(snapshotOnlyAdvancePayload.events[0]?.detail), /河边咖啡馆/);
assert.doesNotThrow(() => assertCompleteLifeLedgerEventPayload(snapshotOnlyAdvancePayload));

const currentStateEvent = createCurrentLifeLedgerEvent(snapshot, now);
assert.equal(currentStateEvent.source, 'life-advance');
assert.equal(currentStateEvent.surface, 'guardian');
assert.equal(currentStateEvent.location, snapshot.location.place);
assert.match(currentStateEvent.summary, /刚刚同步/);
assert.equal(isGuardianVisibleLifeEvent(currentStateEvent), true, '模型只返回重复或隐藏事件时，本地当前状态兜底事件必须可展示');

const aliasEventPayload = normalizeLifeLedgerAdvancePayload({
  snapshot,
  newEvents: [{ title: '新事件别名', summary: '模型使用了常见别名字段。', detail: '这条记录仍会作为新增生活事件保存。' }]
}) as { events: Array<Record<string, unknown>> };
assert.equal(aliasEventPayload.events[0]?.title, '新事件别名', '应兼容模型返回 newEvents 字段');
assert.doesNotThrow(() => assertCompleteLifeLedgerEventPayload(aliasEventPayload));

const migrated = lifeLedgerForCharacter({
  id: '20002', nickname: '角色', name: '角色', avatar: '', description: '', signature: '', userNote: '', boundUserId: '10001', subtitle: '', lastSeen: '', localWorldBookIds: [], voomFrequency: 'low',
  coupleSpace: {
    consentGrantedAt: now - 10_000, relationshipLabel: '恋人', startedAt: '', arrivalReminderEnabled: false, enabled: true, activityFeedEnabled: true, snapshot,
    history: [], wishes: [], life: { lastAdvancedAt: snapshot.generatedAt, events: [commute] }
  }
});
assert.equal(migrated.characterId, '20002');
assert.equal(migrated.current?.id, 'snapshot-current');
assert.equal(migrated.events[0]?.id, 'commute');

const legacyCoupleSpace = {
  consentGrantedAt: now - 10_000, relationshipLabel: '恋人', startedAt: '', arrivalReminderEnabled: false, snapshot,
  history: [], wishes: [], life: { lastAdvancedAt: snapshot.generatedAt, events: [commute] }
};
assert.equal(normalizeCoupleSpaceState(legacyCoupleSpace)?.activityFeedEnabled, true, '旧数据应默认开启聊天内守护动态');
assert.equal(normalizeCoupleSpaceState({ ...legacyCoupleSpace, activityFeedEnabled: false })?.activityFeedEnabled, false, '显式关闭的聊天内守护动态必须保持关闭');
assert.equal(normalizeCoupleSpaceState(legacyCoupleSpace)?.enabled, true, '旧数据应默认开启情侣守护');
assert.equal(normalizeCoupleSpaceState({ ...legacyCoupleSpace, enabled: false })?.enabled, false, '显式关闭的情侣守护必须保持关闭');
assert.equal(normalizeCoupleSpaceState({ ...legacyCoupleSpace, activityFeedEnabled: false })?.enabled, false, '旧版关闭动态应迁移为关闭整个情侣守护');

const expiredCoupleSnapshot = { ...snapshot, id: 'snapshot-expired', generatedAt: now - 24 * 60 * 60_000 - 1 };
const expiredCoupleState = normalizeCoupleSpaceState({
  ...legacyCoupleSpace,
  snapshot: expiredCoupleSnapshot,
  history: [expiredCoupleSnapshot],
  wishes: [{ id: 'wish-expired', content: '过期心愿', createdAt: now - 24 * 60 * 60_000 - 1 }],
  life: { lastAdvancedAt: expiredCoupleSnapshot.generatedAt, events: [expiredEvent] }
}, now);
assert.equal(expiredCoupleState?.snapshot, undefined, '过期情侣空间快照不应继续保存');
assert.equal(expiredCoupleState?.history.length, 0, '过期情侣空间历史不应继续保存');
assert.equal(expiredCoupleState?.wishes.length, 0, '过期情侣空间心愿不应继续保存');
assert.equal(expiredCoupleState?.life.lastAdvancedAt, 0, '过期情侣空间推进时间不应继续保存');
assert.equal(expiredCoupleState?.life.events.length, 0, '过期情侣空间事件不应继续保存');

const expiredLedger = normalizeLifeLedger({
  id: 'ledger-expired', characterId: '20003', createdAt: expiredCoupleSnapshot.generatedAt, updatedAt: expiredCoupleSnapshot.generatedAt,
  lastAdvancedAt: expiredCoupleSnapshot.generatedAt, current: expiredCoupleSnapshot, events: [expiredEvent]
}, '20003', undefined, now);
assert.equal(expiredLedger.current, undefined, '过期账本快照不应继续保存');
assert.equal(expiredLedger.events.length, 0, '过期账本事件不应继续保存');

console.log('life ledger regression: passed');
