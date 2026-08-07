import type { McpServerConfig } from '@/types/domain';

export type MoltbookClaimStatus = 'pending' | 'claimed' | 'unclaimed' | 'disabled' | 'unknown';

export interface MoltbookAccount {
  id: string;
  agentName: string;
  claimUrl: string;
  verificationCode: string;
  claimStatus: MoltbookClaimStatus;
  agentProfileUrl: string;
  metadata: Record<string, unknown>;
  lastCheckedAt: number;
  createdAt: number;
  updatedAt: number;
}

export interface MoltbookActivity {
  id: string;
  accountId: string;
  characterId: string;
  action: string;
  toolName: string;
  target: string;
  status: 'succeeded' | 'failed' | 'rate-limited' | 'verification-pending' | 'pending' | 'blocked';
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: number;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: 'same-origin', headers: { Accept: 'application/json', ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(payload.message ?? payload.error ?? 'Moltbook 请求失败。'));
  return payload as T;
}

export function registerMoltbookAgent(agentName: string, description = '') {
  return request<MoltbookAccount>('/api/moltbook/accounts/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agentName, description }) });
}

export function listMoltbookAccounts() {
  return request<MoltbookAccount[]>('/api/moltbook/accounts');
}

export function refreshMoltbookAccount(accountId: string) {
  return request<MoltbookAccount>(`/api/moltbook/accounts/${encodeURIComponent(accountId)}/status`, { method: 'POST' });
}

export function listMoltbookActivity(limit = 100) {
  return request<MoltbookActivity[]>(`/api/moltbook/activity?limit=${Math.min(200, Math.max(1, limit))}`);
}

export function createMoltbookServer(account: MoltbookAccount, existingId = ''): McpServerConfig {
  return {
    id: existingId || `mcp_moltbook_${account.id}`,
    name: `Moltbook · ${account.agentName}`,
    kind: 'moltbook',
    description: 'Moltbook 官方 API · 角色专属 Agent',
    url: 'builtin://moltbook',
    headers: {},
    apiKey: '',
    apiKeyHeader: 'Authorization',
    apiKeyPrefix: 'Bearer ',
    enabled: true,
    globalEnabled: false,
    toolPolicy: 'all',
    timeoutMs: 45_000,
    tools: [],
    protocolVersion: 'builtin',
    serverName: 'Moltbook Official API',
    serverVersion: '1',
    lastStatus: account.claimStatus === 'claimed' ? 'connected' : 'idle',
    lastCheckedAt: account.lastCheckedAt,
    lastError: account.claimStatus === 'claimed' ? '' : '等待完成 Moltbook Agent 认领。',
    moltbookAccountId: account.id
  };
}