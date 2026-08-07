import assert from 'node:assert/strict';
import { findServerTool, suggestedAccountCapabilities, suggestedUserAccountCapabilities, userSocialManualToolCandidates } from '../src/services/roleOperationCapabilities';
import type { McpServerConfig } from '../src/types/domain';

const now = 1_768_000_000_000;
const writableServer: McpServerConfig = {
  id: 'role-douyin',
  name: '角色抖音适配器',
  kind: 'douyin-search',
  description: '',
  url: 'https://bridge.example.com/mcp',
  headers: {},
  apiKey: '',
  apiKeyHeader: 'Authorization',
  apiKeyPrefix: 'Bearer ',
  enabled: true,
  globalEnabled: false,
  toolPolicy: 'all',
  timeoutMs: 30_000,
  tools: [
    { name: 'douyin_like_video', title: '', description: '', inputSchema: {}, enabled: true, write: true },
    { name: 'douyin_comment_video', title: '', description: '', inputSchema: {}, enabled: true, write: true }
  ],
  protocolVersion: '',
  serverName: '',
  serverVersion: '',
  lastStatus: 'connected',
  lastCheckedAt: now,
  lastError: ''
};

assert.deepEqual(suggestedAccountCapabilities('douyin', writableServer), ['like', 'comment']);
assert.equal(findServerTool(writableServer, userSocialManualToolCandidates.douyin.like, true)?.name, 'douyin_like_video');

const moltbookServer: McpServerConfig = {
  ...writableServer,
  id: 'moltbook-agent',
  name: 'Moltbook · 角色 Agent',
  kind: 'moltbook',
  url: 'builtin://moltbook',
  tools: [
    { name: 'moltbook_upvote_post', title: '', description: '', inputSchema: {}, enabled: true, write: true },
    { name: 'moltbook_create_post', title: '', description: '', inputSchema: {}, enabled: true, write: true },
    { name: 'moltbook_create_comment', title: '', description: '', inputSchema: {}, enabled: true, write: true },
    { name: 'moltbook_follow_agent', title: '', description: '', inputSchema: {}, enabled: true, write: true },
    { name: 'moltbook_create_submolt', title: '', description: '', inputSchema: {}, enabled: true, write: true }
  ],
  moltbookAccountId: 'account-123'
};

assert.deepEqual(suggestedAccountCapabilities('moltbook', moltbookServer), ['like', 'publish', 'comment', 'follow', 'create-community']);

const readServer: McpServerConfig = {
  ...writableServer,
  id: 'user-termux',
  name: 'Termux 抖音查询',
  toolPolicy: 'read-only',
  tools: [
    { name: 'douyin__get_user_info', title: '', description: '', inputSchema: {}, enabled: true, write: false },
    { name: 'douyin__get_user_posts', title: '', description: '', inputSchema: {}, enabled: true, write: false }
  ]
};

assert.deepEqual(suggestedUserAccountCapabilities('douyin', readServer), ['profile', 'posts']);
assert.deepEqual(suggestedAccountCapabilities('douyin', readServer), []);
console.log('Role operations regression checks passed.');
