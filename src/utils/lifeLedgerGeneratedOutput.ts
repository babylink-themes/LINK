function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readEventList(source: Record<string, unknown>) {
  for (const key of ['events', 'newEvents', 'new_events', 'lifeEvents', 'life_events']) {
    if (Array.isArray(source[key])) return source[key];
  }
  return asRecord(source.event) ? [source.event] : [];
}

function readSnapshot(source: Record<string, unknown>) {
  for (const key of ['snapshot', 'currentSnapshot', 'current_snapshot', 'currentState', 'current_state']) {
    const snapshot = asRecord(source[key]);
    if (snapshot) return snapshot;
  }
  return asRecord(source.location) || asRecord(source.device) || asRecord(source.bond) ? source : null;
}

function currentSnapshotEvent(snapshot: Record<string, unknown>) {
  const location = asRecord(snapshot.location) ?? {};
  const device = asRecord(snapshot.device) ?? {};
  const bond = asRecord(snapshot.bond) ?? {};
  const place = readText(location.place);
  const status = readText(location.status);
  const activeApp = readText(device.activeApp);
  const network = readText(device.network);
  const mood = readText(bond.mood);
  const nextPlan = readText(bond.nextPlan);
  const battery = Number(device.battery);
  const hasBattery = Number.isFinite(battery) && battery >= 0 && battery <= 100;
  const charging = typeof device.charging === 'boolean' ? device.charging : undefined;

  if (!place && !status && !activeApp && !mood && !nextPlan) return null;

  const currentActivity = status || (activeApp && activeApp !== '没有正在使用的应用'
    ? `正在使用 ${activeApp}`
    : '正在继续自己的生活');
  const title = place ? `此刻在${place}` : `此刻${currentActivity}`;
  const deviceDetail = [
    hasBattery ? `手机电量 ${Math.round(battery)}%${charging === true ? '，正在充电' : ''}` : '',
    activeApp && activeApp !== '没有正在使用的应用' ? `当前使用 ${activeApp}` : '',
    network && network !== '未分享网络' ? `连接 ${network}` : ''
  ].filter(Boolean).join('，');
  const detail = [
    place ? `角色此刻在${place}，${currentActivity}。` : `角色此刻${currentActivity}。`,
    deviceDetail ? `${deviceDetail}。` : '',
    mood ? `此时的心情是${mood}。` : '',
    nextPlan ? `接下来打算${nextPlan}。` : ''
  ].filter(Boolean).join('');

  return {
    offsetMinutes: 0,
    kind: place ? 'location' : activeApp ? 'app' : 'activity',
    importance: 'notice',
    title,
    summary: place ? `${currentActivity}，这是尚未出现在聊天里的当前生活状态。` : `${currentActivity}，这是尚未出现在聊天里的当前生活状态。`,
    detail,
    icon: place ? '⌖' : activeApp ? '▣' : '✦',
    ...(hasBattery ? { battery: Math.round(battery) } : {}),
    ...(charging !== undefined ? { charging } : {}),
    ...(activeApp && activeApp !== '没有正在使用的应用' ? { app: activeApp } : {}),
    ...(place ? { location: place } : {})
  };
}

export function normalizeLifeLedgerAdvancePayload(payload: unknown) {
  const source = asRecord(payload);
  if (!source) return payload;
  const snapshot = readSnapshot(source);
  const events = readEventList(source);
  const fallbackEvent = !events.length && snapshot ? currentSnapshotEvent(snapshot) : null;
  return {
    ...source,
    ...(snapshot ? { snapshot } : {}),
    events: events.length ? events : fallbackEvent ? [fallbackEvent] : []
  };
}

export function assertCompleteLifeLedgerEventPayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') throw new Error('情侣守护生活推进返回的事件不是对象。');
  const source = payload as Record<string, unknown>;
  const events = source.events;
  if (!Array.isArray(events) || !events.length) throw new Error('情侣守护生活推进缺少新的完整生活事件。');

  events.forEach((event, eventIndex) => {
    if (!event || typeof event !== 'object') throw new Error(`第 ${eventIndex + 1} 条守护事件不是对象。`);
    const record = event as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const summary = typeof record.summary === 'string' ? record.summary.trim() : '';
    const detail = typeof record.detail === 'string' ? record.detail.trim() : '';
    if (!title || !summary || !detail) throw new Error(`第 ${eventIndex + 1} 条守护事件缺少标题、摘要或完整经过。`);
    if (!Array.isArray(record.detailBlocks) || !record.detailBlocks.length) return;

    let hasPrimaryRecord = false;
    let hasConversation = false;
    record.detailBlocks.forEach((block, blockIndex) => {
      if (!block || typeof block !== 'object') throw new Error(`第 ${eventIndex + 1} 条守护事件的第 ${blockIndex + 1} 个详情区块不是对象。`);
      const detailBlock = block as Record<string, unknown>;
      const type = typeof detailBlock.type === 'string' ? detailBlock.type.trim() : '';
      if (type === 'text') {
        if (typeof detailBlock.label !== 'string' || !detailBlock.label.trim() || typeof detailBlock.content !== 'string' || !detailBlock.content.trim()) {
          throw new Error(`第 ${eventIndex + 1} 条守护事件的文本原始记录不完整。`);
        }
        hasPrimaryRecord = true;
        return;
      }
      if (type === 'note') {
        for (const field of ['folder', 'title', 'content', 'updatedAt']) {
          if (typeof detailBlock[field] !== 'string' || !String(detailBlock[field]).trim()) throw new Error(`第 ${eventIndex + 1} 条守护事件的备忘录缺少 ${field}。`);
        }
        hasPrimaryRecord = true;
        return;
      }
      if (type === 'conversation') {
        const messages = detailBlock.messages;
        if (typeof detailBlock.contact !== 'string' || !detailBlock.contact.trim() || typeof detailBlock.relation !== 'string' || !detailBlock.relation.trim() || !Array.isArray(messages) || messages.length < 4) {
          throw new Error(`第 ${eventIndex + 1} 条守护事件的完整对话至少需要联系人、关系和 4 条逐条消息。`);
        }
        messages.forEach((message, messageIndex) => {
          if (!message || typeof message !== 'object') throw new Error(`第 ${eventIndex + 1} 条守护事件的第 ${messageIndex + 1} 条对话不是对象。`);
          const entry = message as Record<string, unknown>;
          if ((entry.sender !== 'character' && entry.sender !== 'contact') || typeof entry.time !== 'string' || !entry.time.trim() || typeof entry.text !== 'string' || !entry.text.trim()) {
            throw new Error(`第 ${eventIndex + 1} 条守护事件的第 ${messageIndex + 1} 条对话不完整。`);
          }
        });
        hasPrimaryRecord = true;
        hasConversation = true;
        return;
      }
      if (type === 'fields') {
        if (typeof detailBlock.title !== 'string' || !detailBlock.title.trim() || !Array.isArray(detailBlock.fields) || !detailBlock.fields.length) {
          throw new Error(`第 ${eventIndex + 1} 条守护事件的字段记录不完整。`);
        }
        detailBlock.fields.forEach((field, fieldIndex) => {
          if (!field || typeof field !== 'object') throw new Error(`第 ${eventIndex + 1} 条守护事件的第 ${fieldIndex + 1} 个字段不是对象。`);
          const entry = field as Record<string, unknown>;
          if (typeof entry.label !== 'string' || !entry.label.trim() || typeof entry.value !== 'string' || !entry.value.trim()) {
            throw new Error(`第 ${eventIndex + 1} 条守护事件的第 ${fieldIndex + 1} 个字段不完整。`);
          }
        });
        return;
      }
      throw new Error(`第 ${eventIndex + 1} 条守护事件包含不支持的详情区块类型。`);
    });

    if (!hasPrimaryRecord) throw new Error(`第 ${eventIndex + 1} 条守护事件详情区块只有元数据，没有完整原始内容。`);
    if (/(?:私聊|群聊|通话|联系人)/.test(title) && !hasConversation) throw new Error(`第 ${eventIndex + 1} 条外部联系人事件的详情区块缺少可读对话记录。`);
  });
}