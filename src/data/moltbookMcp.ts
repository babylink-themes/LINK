import type { McpServerConfig, McpToolDefinition } from '@/types/domain';

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  ...(required.length ? { required } : {})
});

const stringProperty = (description: string) => ({ type: 'string', description });

export const moltbookApiBaseUrl = 'https://www.moltbook.com/api/v1';

export const moltbookMcpTools: McpToolDefinition[] = [
  { name: 'moltbook_get_home', title: '查看 Moltbook 首页', description: '读取角色自己的 Moltbook 首页摘要、通知、关注动态和官方建议。', inputSchema: objectSchema({}), enabled: true, write: false },
  { name: 'moltbook_get_profile', title: '查看 Moltbook 个人主页', description: '读取角色自己的 Moltbook 资料、Karma、帖子和评论统计。', inputSchema: objectSchema({}), enabled: true, write: false },
  { name: 'moltbook_get_feed', title: '查看 Moltbook 动态', description: '读取 Moltbook 帖子流，可按 hot、new 或 top 排序。', inputSchema: objectSchema({ sort: { type: 'string', enum: ['hot', 'new', 'top', 'rising'] }, filter: { type: 'string', enum: ['all', 'following'] }, limit: { type: 'number', minimum: 1, maximum: 50 }, cursor: stringProperty('分页游标') }), enabled: true, write: false },
  { name: 'moltbook_search', title: '搜索 Moltbook', description: '按语义搜索 Moltbook 帖子和评论。', inputSchema: objectSchema({ q: stringProperty('搜索问题或关键词'), type: { type: 'string', enum: ['posts', 'comments', 'all'] }, limit: { type: 'number', minimum: 1, maximum: 50 }, cursor: stringProperty('分页游标') }, ['q']), enabled: true, write: false },
  { name: 'moltbook_get_post', title: '读取 Moltbook 帖子', description: '读取指定 Moltbook 帖子详情。', inputSchema: objectSchema({ postId: stringProperty('帖子 ID') }, ['postId']), enabled: true, write: false },
  { name: 'moltbook_get_comments', title: '读取 Moltbook 评论', description: '读取指定帖子评论树。', inputSchema: objectSchema({ postId: stringProperty('帖子 ID'), sort: { type: 'string', enum: ['best', 'new', 'old'] }, limit: { type: 'number', minimum: 1, maximum: 100 }, cursor: stringProperty('分页游标') }, ['postId']), enabled: true, write: false },
  { name: 'moltbook_create_post', title: '发布 Moltbook 帖子', description: '以角色自己的 Moltbook Agent 身份发布帖子；官方可能要求提交数学验证。', inputSchema: objectSchema({ submoltName: stringProperty('社区名称'), title: stringProperty('帖子标题'), content: stringProperty('帖子正文'), url: stringProperty('链接帖子地址'), type: { type: 'string', enum: ['text', 'link', 'image'] } }, ['submoltName', 'title']), enabled: true, write: true },
  { name: 'moltbook_create_comment', title: '发表评论', description: '以角色自己的 Moltbook Agent 身份评论或回复帖子。', inputSchema: objectSchema({ postId: stringProperty('帖子 ID'), content: stringProperty('评论内容'), parentId: stringProperty('父评论 ID') }, ['postId', 'content']), enabled: true, write: true },
  { name: 'moltbook_upvote_post', title: '点赞帖子', description: '给指定 Moltbook 帖子点赞。', inputSchema: objectSchema({ postId: stringProperty('帖子 ID') }, ['postId']), enabled: true, write: true },
  { name: 'moltbook_downvote_post', title: '取消/反对帖子', description: '对指定 Moltbook 帖子提交反对票。', inputSchema: objectSchema({ postId: stringProperty('帖子 ID') }, ['postId']), enabled: true, write: true },
  { name: 'moltbook_upvote_comment', title: '点赞评论', description: '给指定 Moltbook 评论点赞。', inputSchema: objectSchema({ commentId: stringProperty('评论 ID') }, ['commentId']), enabled: true, write: true },
  { name: 'moltbook_downvote_comment', title: '反对评论', description: '对指定 Moltbook 评论提交反对票。', inputSchema: objectSchema({ commentId: stringProperty('评论 ID') }, ['commentId']), enabled: true, write: true },
  { name: 'moltbook_follow_agent', title: '关注 Agent', description: '让角色关注指定 Moltbook Agent。', inputSchema: objectSchema({ agentName: stringProperty('Agent 名称') }, ['agentName']), enabled: true, write: true },
  { name: 'moltbook_unfollow_agent', title: '取消关注 Agent', description: '让角色取消关注指定 Moltbook Agent。', inputSchema: objectSchema({ agentName: stringProperty('Agent 名称') }, ['agentName']), enabled: true, write: true },
  { name: 'moltbook_create_submolt', title: '创建 Moltbook 社区', description: '以角色身份创建 Moltbook 社区。', inputSchema: objectSchema({ name: stringProperty('URL 安全的社区名'), displayName: stringProperty('展示名称'), description: stringProperty('社区介绍'), allowCrypto: { type: 'boolean', description: '是否允许加密货币相关内容' } }, ['name', 'displayName']), enabled: true, write: true },
  { name: 'moltbook_subscribe_submolt', title: '订阅 Moltbook 社区', description: '订阅指定 Moltbook 社区。', inputSchema: objectSchema({ submoltName: stringProperty('社区名称') }, ['submoltName']), enabled: true, write: true },
  { name: 'moltbook_unsubscribe_submolt', title: '取消订阅社区', description: '取消订阅指定 Moltbook 社区。', inputSchema: objectSchema({ submoltName: stringProperty('社区名称') }, ['submoltName']), enabled: true, write: true },
  { name: 'moltbook_verify_content', title: '提交 Moltbook 内容验证', description: '提交 Moltbook 返回的数学验证答案，使待验证内容公开。', inputSchema: objectSchema({ verificationCode: stringProperty('验证代码'), answer: stringProperty('数学答案') }, ['verificationCode', 'answer']), enabled: true, write: true }
];

function cloneTools() {
  return moltbookMcpTools.map((tool) => ({ ...tool, inputSchema: { ...tool.inputSchema } }));
}

export function createBuiltinMoltbookMcpServer(): McpServerConfig {
  return {
    id: 'mcp_moltbook_builtin',
    name: 'Moltbook · 角色社交网络',
    kind: 'moltbook',
    description: '通过 Moltbook 官方 API 让角色浏览、发帖、评论、点赞、关注和创建社区。',
    url: `builtin://moltbook`,
    headers: {},
    apiKey: '',
    apiKeyHeader: 'Authorization',
    apiKeyPrefix: 'Bearer ',
    enabled: true,
    globalEnabled: false,
    toolPolicy: 'all',
    timeoutMs: 45_000,
    tools: cloneTools(),
    protocolVersion: 'builtin',
    serverName: 'Moltbook Official API',
    serverVersion: 'skill-1.12.0',
    lastStatus: 'idle',
    lastCheckedAt: 0,
    lastError: ''
  };
}