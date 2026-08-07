import type { ChatMessage } from '@/types/domain';

export interface ConversationTimelineMessage extends ChatMessage {
  timelineSequence: number;
  sceneId: string;
}

function compareMessages(left: ChatMessage, right: ChatMessage) {
  const createdAtDifference = left.createdAt - right.createdAt;
  if (createdAtDifference) return createdAtDifference;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export function normalizeConversationTimeline(messages: ChatMessage[], conversationId = ''): ConversationTimelineMessage[] {
  const ordered = [...messages].sort(compareMessages);
  const usedSequences = new Set<number>();
  let nextSequence = 0;
  const fallbackSceneId = `${conversationId || ordered[0]?.conversationId || 'conversation'}:story`;
  return ordered.map((message, index) => {
    const storedSequence = Number(message.timelineSequence);
    const timelineSequence = Number.isInteger(storedSequence) && storedSequence > 0 && !usedSequences.has(storedSequence)
      ? storedSequence
      : Math.max(nextSequence + 1, index + 1);
    usedSequences.add(timelineSequence);
    nextSequence = Math.max(nextSequence, timelineSequence);
    return {
      ...message,
      timelineSequence,
      sceneId: message.sceneId?.trim() || fallbackSceneId
    };
  });
}

export function timelineSequenceForMessages(messages: ChatMessage[], conversationId = '') {
  const normalized = normalizeConversationTimeline(messages, conversationId);
  const byId = new Map(normalized.map((message) => [message.id, message.timelineSequence]));
  return byId;
}