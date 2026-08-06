import { hasTextGenerationConfig, requestTextGenerationDetailed, type TextGenerationResult } from '@/services/ai';
import type { AppSettings, ChatMessage, ConversationTimeAwarenessSettings } from '@/types/domain';
import { jsonrepair } from 'jsonrepair';
import type {
  MemoryAssertion,
  MemoryAssertionKind,
  MemoryDiaryCoverage,
  MemoryEntityType,
  MemoryEpistemicKind,
  MemoryEventBeat,
  MemoryExtractionAssertionDraft,
  MemoryExtractionEntityDraft,
  MemoryExtractionLocationDraft,
  MemoryExtractionResult,
  MemoryExtractionStateDelta,
  MemoryGenerationMetadata,
  MemoryLocationActor,
  MemoryLocationSource,
  MemoryLifecycleActionDraft,
  MemoryStateKind,
  MemoryStoryTime,
  MemoryTheme,
} from '@/types/memory';
import { formatUserTimePreview } from '@/utils/timeAwareness';
import { formatChatMcpOperations } from '@/utils/mcpOperations';
import { extractCompleteJsonObject, limitNarrativeText, normalizeNarrativeText } from '@/utils/structuredText';
import { fallbackMemoryNarrative, parseLooseMemoryJson } from '@/utils/memoryExtractionParsing';
import { isNonRetryableTextApiError } from '@/utils/textApiErrors';

export interface ExtractTemporalMemoryInput {
  settings: AppSettings | undefined;
  modelOverride?: string;
  characterName: string;
  characterContext?: string;
  userName: string;
  worldBookContext?: string;
  messages: ChatMessage[];
  currentAssertions?: MemoryAssertion[];
  timeAwareness?: ConversationTimeAwarenessSettings;
  captureNow?: number;
  signal?: AbortSignal;
  retryTransientFailures?: boolean;
}

const entityTypes = new Set<MemoryEntityType>(['character', 'user', 'person', 'place', 'object', 'organization', 'event', 'concept']);
const assertionKinds = new Set<MemoryAssertionKind>(['fact', 'preference', 'promise', 'conflict', 'relationship', 'impression', 'growth', 'emotion', 'open-loop', 'interpretation', 'boundary']);
const epistemicKinds = new Set<MemoryEpistemicKind>(['told', 'observed', 'inferred', 'hearsay', 'canon']);
const stateKinds = new Set<MemoryStateKind>(['relationship', 'user-impression', 'adaptive-personality', 'mood', 'current-context']);
const locationActors = new Set<MemoryLocationActor>(['character', 'user', 'shared-scene', 'unknown']);
const locationSources = new Set<MemoryLocationSource>(['attachment', 'explicit-text', 'offline-scene', 'inferred']);
const storyTimeKinds = new Set<MemoryStoryTime['kind']>(['exact', 'relative', 'sequence', 'unknown']);

interface MemoryStageGenerationMetadata {
  complete: boolean;
  finishReason?: string;
  outputTokens?: number;
  repairedJson: boolean;
}

export type TemporalMemoryDiaryResult = Pick<MemoryExtractionResult, 'title' | 'narrative' | 'location' | 'locations' | 'emotion' | 'valence' | 'arousal' | 'salience' | 'storyTime' | 'eventBeats' | 'coverage'> & { generation: MemoryStageGenerationMetadata };
export type TemporalMemoryGraphResult = Pick<MemoryExtractionResult, 'entities' | 'assertions' | 'themes' | 'stateDeltas' | 'lifecycleActions'> & { generation: MemoryStageGenerationMetadata };
export interface TemporalMemoryExtractionResult extends MemoryExtractionResult {
  generation: MemoryGenerationMetadata;
}

export async function extractTemporalMemory(input: ExtractTemporalMemoryInput): Promise<TemporalMemoryExtractionResult> {
  requireDedicatedMemoryModel(input.settings, input.modelOverride);
  const diary = await generateTemporalMemoryDiary(input);
  const graph = await extractTemporalMemoryGraph(input);
  return {
    title: diary.title,
    narrative: diary.narrative,
    location: diary.location,
    locations: diary.locations,
    emotion: diary.emotion,
    valence: diary.valence,
    arousal: diary.arousal,
    salience: diary.salience,
    storyTime: diary.storyTime,
    eventBeats: diary.eventBeats,
    coverage: diary.coverage,
    entities: graph.entities,
    assertions: graph.assertions,
    themes: graph.themes,
    stateDeltas: graph.stateDeltas,
    lifecycleActions: graph.lifecycleActions,
    generation: {
      diaryComplete: diary.generation.complete,
      graphComplete: graph.generation.complete,
      diaryFinishReason: diary.generation.finishReason,
      graphFinishReason: graph.generation.finishReason,
      diaryOutputTokens: diary.generation.outputTokens,
      graphOutputTokens: graph.generation.outputTokens,
      repairedJson: diary.generation.repairedJson || graph.generation.repairedJson
    }
  };
}

export async function generateTemporalMemoryDiary(input: ExtractTemporalMemoryInput): Promise<TemporalMemoryDiaryResult> {
  requireDedicatedMemoryModel(input.settings, input.modelOverride);
  const prompt = buildMemoryDiaryPrompt(input);
  let lastError: unknown;
  let lastResponse: TextGenerationResult | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptPrompt = attempt === 0
      ? prompt
      : `${prompt}\n\n上一次没有返回可解析的日记 JSON。请重新输出一个完整 JSON 对象。`;
    const response = await requestTextGenerationDetailed(input.settings, attemptPrompt, input.modelOverride, {
      temperature: attempt === 0 ? 0.1 : 0.05,
      maxTokens: attempt === 0 ? 2_560 : 4_096,
      jsonMode: true,
      signal: input.signal,
      retryTransientFailures: input.retryTransientFailures,
    });
    lastResponse = response;
    try {
      const parseMetadata = { repairedJson: false };
      const parsed = parseTemporalMemoryExtractionResponse(response.text, parseMetadata);
      return pickTemporalMemoryDiary(parsed, generationMetadata(response, parseMetadata.repairedJson, !response.incomplete));
    } catch (error) {
      if (isNonRetryableTextApiError(error)) throw error;
      lastError = error;
    }
  }
  if (lastResponse) {
    const parseMetadata = { repairedJson: false };
    const parsed = parseTemporalMemoryExtractionResponse(lastResponse.text, parseMetadata);
    return pickTemporalMemoryDiary(parsed, generationMetadata(lastResponse, parseMetadata.repairedJson, false));
  }
  const reason = lastError instanceof Error ? lastError.message : '日记模型没有返回内容。';
  throw new Error(reason);
}

export async function extractTemporalMemoryGraph(input: ExtractTemporalMemoryInput): Promise<TemporalMemoryGraphResult> {
  const prompt = buildMemoryGraphPrompt(input);
  let lastError: unknown;
  let lastResponse: TextGenerationResult | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptPrompt = attempt === 0
      ? prompt
      : `${prompt}\n\n上一次图谱 JSON 不完整。请压缩输出，只保留最重要且有消息证据的条目，从头输出完整 JSON。`;
    try {
      const response = await requestTextGenerationDetailed(input.settings, attemptPrompt, input.modelOverride, {
        temperature: attempt === 0 ? 0.05 : 0,
        maxTokens: attempt === 0 ? 6_144 : 10_240,
        jsonMode: true,
        signal: input.signal,
        retryTransientFailures: input.retryTransientFailures,
      });
      lastResponse = response;
      const parseMetadata = { repairedJson: false };
      return {
        ...parseTemporalMemoryGraphResponse(response.text, parseMetadata),
        generation: generationMetadata(response, parseMetadata.repairedJson, !response.incomplete)
      };
    } catch (error) {
      if (isNonRetryableTextApiError(error)) throw error;
      lastError = error;
    }
  }
  if (lastResponse) {
    const parseMetadata = { repairedJson: false };
    return {
      ...parseTemporalMemoryGraphResponse(lastResponse.text, parseMetadata),
      generation: generationMetadata(lastResponse, parseMetadata.repairedJson, false)
    };
  }
  return {
    entities: [],
    assertions: [],
    themes: [],
    stateDeltas: [],
    lifecycleActions: [],
    generation: {
      complete: false,
      finishReason: lastError instanceof Error ? lastError.message : '图谱模型没有返回内容。',
      repairedJson: false
    }
  };
}

export function parseTemporalMemoryGraphResponse(raw: string, metadata: { repairedJson: boolean } = { repairedJson: false }): Omit<TemporalMemoryGraphResult, 'generation'> {
  return normalizeMemoryGraphResult(tryParseJsonObject(raw, metadata) ?? {});
}

export interface ConsolidateMemoryThemeInput {
  settings: AppSettings | undefined;
  modelOverride?: string;
  retryTransientFailures?: boolean;
  characterName: string;
  userName: string;
  theme: MemoryTheme;
  assertions: MemoryAssertion[];
}

export async function consolidateMemoryThemeReport(input: ConsolidateMemoryThemeInput): Promise<string> {
  const activeAssertions = input.assertions
    .filter((assertion) => input.theme.assertionIds.includes(assertion.id))
    .filter((assertion) => assertion.status === 'current' || assertion.status === 'open' || assertion.status === 'disputed')
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 18);
  if (!activeAssertions.length) throw new Error('当前主题没有可用于整理的有效认知。');
  requireDedicatedMemoryModel(input.settings, input.modelOverride);
  const evidence = activeAssertions
    .map((assertion, index) => `${index + 1}. ${assertion.perspectiveText}（${assertion.kind}；确信度${Math.round(assertion.confidence * 100)}%）`)
    .join('\n');
  const prompt = `你是${input.characterName}的长期记忆整理者。请把“${input.theme.name}”主题下的原子记忆整合成一段可供${input.characterName}自然回忆的主题报告，只输出 JSON：{"report":"..."}。
要求：
1. 全文使用${input.characterName}第一人称，像我对这件事的当前理解，不要写成数据库摘要。
2. 必须只依据证据，概括稳定模式、最近变化、矛盾或仍未完成的事；不要把推测写成事实。
3. 120-320 字，避免逐条复述；这段报告会替代多条重复断言进入 prompt。

主题：${input.theme.name}
证据：
${evidence}`;
  const response = await requestTextGenerationDetailed(input.settings, prompt, input.modelOverride, {
    temperature: 0.15,
    maxTokens: 500,
    jsonMode: true,
    retryTransientFailures: input.retryTransientFailures,
  });
  const parsed = parseJsonObject(requireCompleteGenerationJson(response, '主题记忆报告'));
  const report = cleanText(parsed.report, 700);
  if (!report) throw new Error('主题记忆整理结果缺少 report 字段。');
  return report;
}

function requireDedicatedMemoryModel(settings: AppSettings | undefined, modelOverride = '') {
  if (!modelOverride.trim()) {
    throw new Error('请先在模型切换中配置“总结、图谱模型”。记忆不会回退使用线上或线下聊天模型。');
  }
  if (!hasTextGenerationConfig(settings, modelOverride)) {
    throw new Error('当前“总结、图谱模型”不可用，请检查模型配置。');
  }
}

function buildMemoryDiaryPrompt(input: ExtractTemporalMemoryInput): string {
  const timeAwarenessEnabled = Boolean(input.timeAwareness?.enabled);
  const messageRows = input.messages
    .map((message, index) => JSON.stringify({
      id: message.id,
      order: index + 1,
      sender: message.sender === 'user' ? input.userName : message.sender === 'char' ? input.characterName : '系统',
      mode: message.mode,
      ...(timeAwarenessEnabled ? { sentAt: formatMemoryMessageTime(message.createdAt) } : {}),
      content: renderMessageContent(message),
    }))
    .join('\n');
  return `请以${input.characterName}的第一人称写一篇简短私人日记，并附少量可核验的事件细节，只输出一个 JSON 对象，不要提取知识图谱。

用户真名是“${input.userName}”，不要用网名代指用户。

写作要求：
1. 只写下方对话里实际发生、${input.characterName}亲历或得知的内容，不补写未发生的事件。
2. narrative 只写 80–220 个中文字符，最多 1–3 个短段；不要为了“详细”扩写氛围、心理或背景。
3. eventBeats 只保留最多 8 个最重要的时间、地点、行动、事实、变化、承诺或未解问题；细节写入 beat，不要在 narrative 里重复。
4. 每个 beat 的每类数组最多 4 项，每项简短；没有证据就留空，不要编造。
5. 使用${input.characterName}自然的第一人称口吻。title 和 narrative 必填，事件简单时一两句也可以。
5. location 只是兼容显示字段；locations 以及 beat 内 location 都必须有消息证据。线上定位只属于发送者，不能据此认定双方共处；线下只有消息明确描述共同场景时才能使用 shared-scene。
7. coverage 只记录消息覆盖情况；narrative 必须自然收束并完整结束，不要为了覆盖字段重复全文。

时间规则：
${buildMemoryTemporalRules(input)}

JSON 结构：
{
  "title":"简短经历标题",
  "narrative":"80–220字的第一人称日记正文，不重复 eventBeats",
  "location":"有证据的主要地点或空字符串",
  "locations":[{"actor":"character|user|shared-scene|unknown","source":"attachment|explicit-text|offline-scene|inferred","label":"地点名","address":"可选地址","distance":"可选距离","evidenceMessageIds":["消息id"],"confidence":0到1}],
  "emotion":"主要情绪或空字符串",
  "valence":-1到1,
  "arousal":0到1,
  "salience":0到1,
  "storyTime":{"kind":"exact|relative|sequence|unknown","text":"如第二天清晨、三天前","occurredAt":可选毫秒时间戳,"relativeOffsetMs":可选相对本轮消息时间的毫秒偏移,"sequence":可选剧情顺序整数,"confidence":0到1},
  "eventBeats":[{
    "order":1,
    "sourceMessageIds":["消息id"],
    "timeText":"可选的原始时间表达",
    "location":{"actor":"character|user|shared-scene|unknown","source":"attachment|explicit-text|offline-scene|inferred","label":"地点名","evidenceMessageIds":["消息id"],"confidence":0到1},
    "participants":["参与者"],
    "actions":["谁做了什么"],
    "dialogueFacts":["谁明确说了什么事实"],
    "changes":["关系、地点、情绪、物品或计划的前后变化"],
    "commitments":["承诺、计划、完成或取消"],
    "unresolvedQuestions":["仍未解决的问题"]
  }],
  "coverage":{"coveredMessageIds":["消息id"],"omittedMessageIds":["消息id"],"omissionReasons":["与记忆无关的原因"]}
}

角色设定与写作基准：
${input.characterContext?.trim() || '未提供额外角色设定；保持克制，只依据本轮实际措辞确定口吻。'}

本轮可用世界书背景：
${input.worldBookContext?.trim() || '无启用且匹配的世界书条目。'}

本轮对话：
${messageRows || '无'}

现在只输出精简日记 JSON，不要输出 Markdown、HTML 标签或额外解释。`;
}

function buildMemoryGraphPrompt(input: ExtractTemporalMemoryInput): string {
  const timeAwarenessEnabled = Boolean(input.timeAwareness?.enabled);
  const messageRows = input.messages
    .map((message, index) => JSON.stringify({
      id: message.id,
      order: index + 1,
      sender: message.sender === 'user' ? input.userName : message.sender === 'char' ? input.characterName : '系统',
      mode: message.mode,
      ...(timeAwarenessEnabled ? { sentAt: formatMemoryMessageTime(message.createdAt) } : {}),
      content: renderMessageContent(message),
    }))
    .join('\n');
  const assertionRows = (input.currentAssertions ?? [])
    .filter((assertion) => assertion.status === 'current' || assertion.status === 'open' || assertion.status === 'disputed')
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, 60)
    .map((assertion) => JSON.stringify({
      id: assertion.id,
      kind: assertion.kind,
      status: assertion.status,
      text: assertion.perspectiveText,
      confidence: assertion.confidence,
      validFrom: assertion.validFrom,
    }))
    .join('\n');

  return `你是${input.characterName}的“主观记忆编码器”，不是故事续写者，也不是全知数据库。请将本轮对话编码成时序知识图谱，只输出一个 JSON 对象。

图谱规则：
1. perspectiveText 与状态 summary 必须使用${input.characterName}的第一人称视角（我）。
2. 只记录本轮消息有直接证据的信息。角色不知道的事不能记录；推断必须标为 inferred 并降低 confidence。
3. 区分 told（用户告知）、observed（角色亲历/观察）、inferred（角色推断）、hearsay（转述）、canon（明确设定）。
4. 不记录寒暄、措辞细节和无长期价值内容。优先记录偏好、边界、承诺、冲突、重要事件、关系变化、未完成事项。
5. 单条 assertion 只表达一个原子含义，同一条可属于多个 themes。
6. evidenceMessageIds 只能使用下方给出的消息 id。没有证据就不要输出断言。
7. 新信息明确替代旧认知时，把旧 id 放入 supersedesAssertionIds；信息互相冲突但无法判断时放入 contradictsAssertionIds。不要因为对象不同就擅自覆盖可并存的喜好。
8. adaptive-personality 只描述${input.characterName}在反复经历后形成的缓慢适应，不能修改核心人设。relationship/user-impression 也只输出小幅 delta；一次普通对话不得人格突变。
9. 角色设定与世界书只用于身份关系和角色已知背景，不能替代消息证据。
10. 只输出图谱字段，不要输出 title、narrative、location、emotion、valence、arousal 或 salience。
11. 对已有 promise 或 open-loop，若本轮明确完成则写 lifecycleActions 的 resolve，明确取消则写 cancel。只能引用“当前已有认知”中给出的 id，且必须提供本轮证据消息 id。
12. entities 最多 8 条、assertions 最多 10 条、themes 最多 5 条、stateDeltas 最多 3 条、lifecycleActions 最多 6 条；没有内容时输出空数组，不得省略字段。
13. ${timeAwarenessEnabled ? '只有消息明确给出时间或可依据本轮本地时间可靠换算时，才填写 validFrom、validTo、dueAt。' : '时间感知已关闭：不得把“今天、昨天、明天、刚才”等相对表达擅自换算成绝对时间；除非消息直接给出绝对日期，否则省略 validFrom、validTo、dueAt。'}
14. current-context 与 mood 只描述本轮短暂状态，禁止把旧地点或旧情绪写成永久当前状态。

JSON 结构：
{
  "entities": [{"key":"本次唯一键","name":"名称","type":"character|user|person|place|object|organization|event|concept","aliases":[],"description":""}],
  "assertions": [{
    "subjectKey":"self|user|实体key",
    "predicate":"短谓词",
    "objectKey":"可选实体key",
    "objectText":"对象文本",
    "kind":"fact|preference|promise|conflict|relationship|impression|growth|emotion|open-loop|interpretation|boundary",
    "epistemicKind":"told|observed|inferred|hearsay|canon",
    "perspectiveText":"我的第一人称记忆句",
    "confidence":0到1,
    "importance":0到1,
    "emotionalWeight":0到1,
    "relationshipImpact":-1到1,
    "evidenceMessageIds":["消息id"],
    "themes":["主题名"],
    "supersedesAssertionIds":["旧断言id"],
    "contradictsAssertionIds":["旧断言id"],
    "validFrom":毫秒时间戳或省略,
    "validTo":毫秒时间戳或省略,
    "dueAt":毫秒时间戳或省略
  }],
  "themes":["主题名"],
  "stateDeltas":[{
    "kind":"relationship|user-impression|adaptive-personality|mood|current-context",
    "summary":"我的第一人称状态概括",
    "confidence":0到1,
    "facets":[{"key":"稳定英文或中文键","label":"显示名","delta":-1到1}]
  }],
  "lifecycleActions":[{
    "type":"resolve|cancel",
    "targetAssertionId":"当前已有认知中的 promise 或 open-loop id",
    "evidenceMessageIds":["本轮消息id"],
    "reason":"完成或取消的直接证据"
  }]
}

角色设定与写作基准：
${input.characterContext?.trim() || '未提供额外角色设定；保持克制，只依据本轮实际措辞推断口吻。'}

本轮可用世界书背景：
${input.worldBookContext?.trim() || '无启用且匹配的世界书条目。'}

当前已有认知（可能为空；只能引用这里出现的旧断言 id）：
${assertionRows || '无'}

本轮带证据消息（每行一个 JSON）：
${messageRows || '无'}

现在仅输出 JSON。`;
}

function renderMessageContent(message: ChatMessage): string {
  const parts = [String(message.content ?? '').trim()];
  if (message.quote) parts.push(`[引用：${message.quote.content || ''}]`);
  if (message.sticker) parts.push(`[表情：${message.sticker.description}]`);
  if (message.image) parts.push(`[图片：${message.image.description}]`);
  if (message.voice) parts.push(`[语音：${message.voice.transcript}]`);
  if (message.location) parts.push(`[位置：名称=${message.location.name}；地址=${message.location.address || '未提供'}；与对方距离=${message.location.distance}]`);
  if (message.mcpOperations?.length) parts.push(formatChatMcpOperations(message.mcpOperations));
  if (message.mcpResult) parts.push(`[MCP 结构化结果：${message.mcpResult.serverName} ${message.mcpResult.toolName} ${JSON.stringify(message.mcpResult.items)}]`);
  if (message.transfer) parts.push(`[转账：${message.transfer.amount} ${message.transfer.note || ''}]`);
  if (message.commerce) parts.push(`[共同事件：${message.commerce.storeName} ${message.commerce.items.map((item) => item.name).join('、')}]`);
  if (message.musicListenInvite) parts.push(`[一起听：${message.musicListenInvite.track?.name || message.musicListenInvite.note || ''}]`);
  if (message.linkPreview) parts.push(`[链接分享：${message.linkPreview.title} ${message.linkPreview.description} ${message.linkPreview.url}]`);
  if (message.theaterLink) parts.push(`[分享内容：${message.theaterLink.title} ${message.theaterLink.summary}]`);
  if (message.offlineInvitation) parts.push(`[线下情景：${message.offlineInvitation.prompt || message.offlineInvitation.status || ''}]`);
  if (message.call) parts.push(`[通话：${message.call.status || ''}]`);
  if (message.gobang) parts.push(`[五子棋：${message.gobang.status || ''}]`);
  return parts.filter(Boolean).join('\n');
}

function parseJsonObject(raw: string, metadata: { repairedJson: boolean } = { repairedJson: false }): Record<string, unknown> {
  const parsed = parseLooseMemoryJson(raw, metadata);
  if (parsed) return parsed;
  throw new Error('记忆抽取结果不是有效 JSON 对象。');
}

function tryParseJsonObject(raw: string, metadata: { repairedJson: boolean } = { repairedJson: false }): Record<string, unknown> | null {
  return parseLooseMemoryJson(raw, metadata);
}

export function parseTemporalMemoryExtractionResponse(raw: string, metadata: { repairedJson: boolean } = { repairedJson: false }): MemoryExtractionResult {
  const parsed = tryParseJsonObject(raw, metadata);
  if (parsed) {
    const originalNarrative = normalizeNarrativeText(parsed.narrative ?? parsed.memory ?? parsed.summary ?? parsed.content);
    return normalizeExtractionResult({ ...parsed, narrative: originalNarrative || fallbackMemoryNarrative(raw) });
  }
  return normalizeExtractionResult({ narrative: fallbackMemoryNarrative(raw) });
}

function pickTemporalMemoryDiary(result: MemoryExtractionResult, generation: MemoryStageGenerationMetadata): TemporalMemoryDiaryResult {
  return {
    title: result.title,
    narrative: result.narrative,
    location: result.location,
    locations: result.locations,
    emotion: result.emotion,
    valence: result.valence,
    arousal: result.arousal,
    salience: result.salience,
    storyTime: result.storyTime,
    eventBeats: result.eventBeats,
    coverage: result.coverage,
    generation,
  };
}

function normalizeExtractionResult(raw: Record<string, unknown>): MemoryExtractionResult {
  const graph = normalizeMemoryGraphResult(raw);
  const narrative = limitNarrativeText(normalizeNarrativeText(raw.narrative ?? raw.memory ?? raw.summary ?? raw.content), 720)
    || '我记得我们最近有过一段值得留下的交流。';
  const title = cleanText(raw.title ?? raw.memoryTitle, 80)
    || cleanText(narrative, 28)
    || '最近的一段相处';
  return {
    title,
    narrative,
    location: cleanText(raw.location, 80),
    locations: flexibleRecordArray(raw.locations ?? raw.locationEvidence, ['actor', 'source', 'label'], 'label').slice(0, 12).flatMap(normalizeLocationDraft),
    emotion: cleanText(raw.emotion, 80),
    valence: boundedNumber(raw.valence, -1, 1, 0),
    arousal: boundedNumber(raw.arousal, 0, 1, 0.25),
    salience: boundedNumber(raw.salience, 0, 1, 0.45),
    storyTime: normalizeStoryTime(raw.storyTime ?? raw.story_time),
    eventBeats: flexibleRecordArray(raw.eventBeats ?? raw.events ?? raw.beats, ['sourceMessageIds', 'actions', 'order'], 'order').slice(0, 24).flatMap(normalizeEventBeat),
    coverage: normalizeDiaryCoverage(raw.coverage),
    ...graph,
  };
}

function normalizeMemoryGraphResult(raw: Record<string, unknown>): Omit<TemporalMemoryGraphResult, 'generation'> {
  const rawEntities = flexibleRecordArray(raw.entities ?? raw.entityList ?? raw.entity, ['key', 'name', 'type'], 'key').slice(0, 30);
  const rawAssertions = flexibleRecordArray(raw.assertions ?? raw.memories ?? raw.memoryItems, ['subjectKey', 'predicate', 'perspectiveText']).slice(0, 40);
  const rawStateDeltas = flexibleRecordArray(raw.stateDeltas ?? raw.stateDelta ?? raw.states, ['kind', 'summary']).slice(0, 10);
  const entities = rawEntities.flatMap(normalizeEntityDraft);
  const assertions = rawAssertions.flatMap(normalizeAssertionDraft);
  const stateDeltas = rawStateDeltas.flatMap(normalizeStateDelta);
  return {
    entities,
    assertions,
    themes: unique(flexibleStringArray(raw.themes ?? raw.theme).map((item) => cleanText(item, 60)).filter(Boolean)).slice(0, 12),
    stateDeltas,
    lifecycleActions: flexibleRecordArray(raw.lifecycleActions ?? raw.lifecycle ?? raw.actions, ['type', 'targetAssertionId'], 'targetAssertionId').slice(0, 12).flatMap(normalizeLifecycleAction),
  };
}

function normalizeStoryTime(value: unknown): MemoryStoryTime | undefined {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!raw) return undefined;
  const kind = cleanText(raw.kind, 20) as MemoryStoryTime['kind'];
  if (!storyTimeKinds.has(kind)) return undefined;
  const relativeOffsetMs = Number(raw.relativeOffsetMs ?? raw.offsetMs);
  const relativeOffsetDays = Number(raw.relativeOffsetDays);
  const offset = Number.isFinite(relativeOffsetMs)
    ? relativeOffsetMs
    : Number.isFinite(relativeOffsetDays)
      ? relativeOffsetDays * 86_400_000
      : undefined;
  const sequence = Number(raw.sequence);
  const occurredAt = positiveTime(raw.occurredAt ?? raw.storyOccurredAt);
  const text = cleanText(raw.text ?? raw.relativeText ?? raw.label, 120) || undefined;
  if (kind !== 'unknown' && !text && !occurredAt && !Number.isFinite(offset) && !Number.isFinite(sequence)) return undefined;
  return {
    kind,
    text,
    occurredAt,
    relativeOffsetMs: Number.isFinite(offset) ? Math.max(-3_650 * 86_400_000, Math.min(3_650 * 86_400_000, offset as number)) : undefined,
    sequence: Number.isFinite(sequence) ? Math.round(sequence) : undefined,
    confidence: clamp(raw.confidence, 0, 1),
  };
}

function normalizeEventBeat(raw: Record<string, unknown>): MemoryEventBeat[] {
  const sourceMessageIds = unique(stringArray(raw.sourceMessageIds).map((item) => cleanText(item, 120)).filter(Boolean)).slice(0, 20);
  if (!sourceMessageIds.length) return [];
  const location = raw.location && typeof raw.location === 'object' && !Array.isArray(raw.location)
    ? normalizeLocationDraft(raw.location as Record<string, unknown>)[0]
    : undefined;
  return [{
    order: Math.max(1, Math.round(Number(raw.order) || 1)),
    sourceMessageIds,
    timeText: cleanText(raw.timeText ?? raw.time, 120) || undefined,
    location,
    participants: unique(flexibleStringArray(raw.participants).map((item) => cleanText(item, 80)).filter(Boolean)).slice(0, 12),
    actions: unique(flexibleStringArray(raw.actions).map((item) => cleanText(item, 240)).filter(Boolean)).slice(0, 16),
    dialogueFacts: unique(flexibleStringArray(raw.dialogueFacts ?? raw.facts).map((item) => cleanText(item, 240)).filter(Boolean)).slice(0, 16),
    changes: unique(flexibleStringArray(raw.changes).map((item) => cleanText(item, 240)).filter(Boolean)).slice(0, 12),
    commitments: unique(flexibleStringArray(raw.commitments ?? raw.promises).map((item) => cleanText(item, 240)).filter(Boolean)).slice(0, 12),
    unresolvedQuestions: unique(flexibleStringArray(raw.unresolvedQuestions ?? raw.openQuestions).map((item) => cleanText(item, 180)).filter(Boolean)).slice(0, 12),
  }];
}

function normalizeDiaryCoverage(value: unknown): MemoryDiaryCoverage | undefined {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  if (!raw) return undefined;
  return {
    coveredMessageIds: unique(stringArray(raw.coveredMessageIds).map((item) => cleanText(item, 120)).filter(Boolean)).slice(0, 120),
    omittedMessageIds: unique(stringArray(raw.omittedMessageIds).map((item) => cleanText(item, 120)).filter(Boolean)).slice(0, 120),
    omissionReasons: flexibleStringArray(raw.omissionReasons).map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 120),
  };
}

function normalizeLifecycleAction(raw: Record<string, unknown>): MemoryLifecycleActionDraft[] {
  const type = cleanText(raw.type, 20);
  const targetAssertionId = cleanText(raw.targetAssertionId ?? raw.assertionId, 160);
  const evidenceMessageIds = unique(stringArray(raw.evidenceMessageIds).map((item) => cleanText(item, 120)).filter(Boolean)).slice(0, 20);
  if ((type !== 'resolve' && type !== 'cancel') || !targetAssertionId || !evidenceMessageIds.length) return [];
  return [{
    type,
    targetAssertionId,
    evidenceMessageIds,
    reason: cleanText(raw.reason, 240),
  }];
}


function normalizeEntityDraft(raw: Record<string, unknown>): MemoryExtractionEntityDraft[] {
  const key = cleanText(raw.key, 60);
  const name = cleanText(raw.name, 80);
  const type = cleanText(raw.type, 30) as MemoryEntityType;
  if (!key || !name || !entityTypes.has(type)) return [];
  return [{
    key,
    name,
    type,
    aliases: unique(stringArray(raw.aliases).map((item) => cleanText(item, 80)).filter(Boolean)).slice(0, 12),
    description: cleanText(raw.description, 400),
  }];
}

function normalizeLocationDraft(raw: Record<string, unknown>): MemoryExtractionLocationDraft[] {
  const actor = cleanText(raw.actor, 30) as MemoryLocationActor;
  const source = cleanText(raw.source, 30) as MemoryLocationSource;
  const label = cleanText(raw.label ?? raw.name, 160);
  const evidenceMessageIds = unique(stringArray(raw.evidenceMessageIds).map((item) => cleanText(item, 120)).filter(Boolean)).slice(0, 12);
  if (!locationActors.has(actor) || !locationSources.has(source) || !label || !evidenceMessageIds.length) return [];
  return [{
    actor,
    source,
    label,
    address: cleanText(raw.address, 240) || undefined,
    distance: cleanText(raw.distance, 120) || undefined,
    evidenceMessageIds,
    confidence: clamp(raw.confidence, 0, 1)
  }];
}

function normalizeAssertionDraft(raw: Record<string, unknown>): MemoryExtractionAssertionDraft[] {
  const subjectKey = cleanText(raw.subjectKey, 60);
  const predicate = cleanText(raw.predicate, 80);
  const objectText = cleanText(raw.objectText, 240);
  const perspectiveText = cleanText(raw.perspectiveText, 520);
  const kind = cleanText(raw.kind, 30) as MemoryAssertionKind;
  const epistemicKind = cleanText(raw.epistemicKind, 30) as MemoryEpistemicKind;
  const evidenceMessageIds = unique(stringArray(raw.evidenceMessageIds).map((item) => cleanText(item, 120)).filter(Boolean)).slice(0, 20);
  if (!subjectKey || !predicate || !objectText || !perspectiveText || !evidenceMessageIds.length || !assertionKinds.has(kind) || !epistemicKinds.has(epistemicKind)) return [];
  return [{
    subjectKey,
    predicate,
    objectKey: cleanText(raw.objectKey, 60) || undefined,
    objectText,
    kind,
    epistemicKind,
    perspectiveText,
    confidence: clamp(raw.confidence, 0, 1),
    importance: clamp(raw.importance, 0, 1),
    emotionalWeight: clamp(raw.emotionalWeight, 0, 1),
    relationshipImpact: clamp(raw.relationshipImpact, -1, 1),
    evidenceMessageIds,
    themes: unique(stringArray(raw.themes).map((item) => cleanText(item, 60)).filter(Boolean)).slice(0, 10),
    supersedesAssertionIds: unique(stringArray(raw.supersedesAssertionIds).map((item) => cleanText(item, 140)).filter(Boolean)).slice(0, 20),
    contradictsAssertionIds: unique(stringArray(raw.contradictsAssertionIds).map((item) => cleanText(item, 140)).filter(Boolean)).slice(0, 20),
    validFrom: positiveTime(raw.validFrom),
    validTo: positiveTime(raw.validTo),
    dueAt: positiveTime(raw.dueAt),
  }];
}

function normalizeStateDelta(raw: Record<string, unknown>): MemoryExtractionStateDelta[] {
  const kind = cleanText(raw.kind, 40) as MemoryStateKind;
  const summary = cleanText(raw.summary, 240);
  if (!stateKinds.has(kind) || !summary) return [];
  const facets = arrayOfRecords(raw.facets).slice(0, 16).flatMap((facet) => {
    const key = cleanText(facet.key, 60);
    const label = cleanText(facet.label, 60) || key;
    if (!key) return [];
    return [{ key, label, delta: clamp(facet.delta, -1, 1) }];
  });
  return [{ kind, summary, confidence: clamp(raw.confidence, 0, 1), facets }];
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function decodeNestedJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text.startsWith('[') && !text.startsWith('{')) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    try {
      return JSON.parse(jsonrepair(text)) as unknown;
    } catch {
      return value;
    }
  }
}

function flexibleRecordArray(value: unknown, entryKeys: string[], mapKeyField = ''): Record<string, unknown>[] {
  const decoded = decodeNestedJson(value);
  if (Array.isArray(decoded)) return arrayOfRecords(decoded);
  if (!decoded || typeof decoded !== 'object') return [];
  const record = decoded as Record<string, unknown>;
  if (entryKeys.some((key) => key in record)) return [record];
  return Object.entries(record).flatMap(([key, item]) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const entry = item as Record<string, unknown>;
    return [{ ...entry, ...(mapKeyField && !(mapKeyField in entry) ? { [mapKeyField]: key } : {}) }];
  });
}

function flexibleStringArray(value: unknown): string[] {
  const decoded = decodeNestedJson(value);
  if (Array.isArray(decoded)) {
    return decoded.flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        const label = String(record.name ?? record.label ?? record.title ?? '').trim();
        return label ? [label] : [];
      }
      return [];
    });
  }
  if (typeof decoded === 'string') return decoded.split(/[,，、;；|\n]+/).map((item) => item.trim()).filter(Boolean);
  if (decoded && typeof decoded === 'object') return Object.keys(decoded as Record<string, unknown>);
  return [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function formatMemoryMessageTime(timestamp: number) {
  const value = new Date(timestamp);
  if (!Number.isFinite(value.getTime())) return '';
  const local = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short'
  }).format(value);
  return `${local}（${value.toISOString()}）`;
}

function buildMemoryTemporalRules(input: ExtractTemporalMemoryInput) {
  const hasOfflineMessages = input.messages.some((message) => message.mode === 'offline');
  if (!input.timeAwareness?.enabled) {
    return [
      '时间感知已关闭。消息顺序只表示先后，不得据此推断现实日期、作息、今天/昨天/明天或已经过去多久。',
      hasOfflineMessages ? '线下 RP 的消息创建时间不是剧情内时间；只有正文明确写出的剧情时间才可写入日记。' : ''
    ].filter(Boolean).join('\n');
  }
  const captureNow = typeof input.captureNow === 'number' && Number.isFinite(input.captureNow)
    ? input.captureNow
    : Date.now();
  const now = new Date(captureNow);
  return [
    `本次编码时的用户本地现实时间：${formatUserTimePreview(now)}。`,
    '消息 sentAt 是历史发送时间；只能用于排序和计算间隔，不能冒充当前时间。',
    hasOfflineMessages ? '线下 RP 的 sentAt 仍是现实创建时间，不等于剧情内时间；剧情时间只依据正文明确证据。' : ''
  ].filter(Boolean).join('\n');
}

function requireCompleteJsonObject(raw: string, label: string) {
  const complete = extractCompleteJsonObject(raw);
  if (!complete) throw new Error(`${label}模型返回了未闭合的 JSON，结果未写入记忆。`);
  return complete.json;
}

function requireCompleteGenerationJson(result: TextGenerationResult, label: string) {
  if (result.incomplete) {
    const reason = result.finishReason || result.status || result.incompleteReason || '上游未完整结束';
    throw new Error(`${label}模型输出未完成（${reason}），结果未写入记忆。`);
  }
  if (!result.text.trim()) throw new Error(`${label}模型没有返回内容。`);
  return requireCompleteJsonObject(result.text, label);
}

function generationMetadata(result: TextGenerationResult, repairedJson: boolean, complete = true): MemoryStageGenerationMetadata {
  return {
    complete,
    finishReason: result.finishReason || result.status || undefined,
    outputTokens: result.usage?.outputTokens,
    repairedJson
  };
}

function positiveTime(value: unknown): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return undefined;
  const milliseconds = number < 100_000_000_000 ? number * 1_000 : number;
  return milliseconds >= Date.UTC(1900, 0, 1) && milliseconds <= Date.UTC(2300, 0, 1) ? milliseconds : undefined;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/\u0000/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function clamp(value: unknown, minimum: number, maximum: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
