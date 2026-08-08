import assert from 'node:assert/strict';
import { compactJsonSchema, createCompactMcpPlannerCatalog, createCompactReferenceCatalog, createCompactStickerPromptCatalog, expandCompactJsonSchema } from '../src/utils/promptCatalog';

const stickers = createCompactStickerPromptCatalog([
  { id: 's1', description: '第一张贴纸' },
  { id: 'sticker-a', description: '第二张贴纸' }
]);

assert.notEqual(stickers.entries[0]?.[0], 's1');
assert.equal(stickers.resolve(stickers.entries[0]?.[0] ?? ''), 's1');
assert.equal(stickers.resolve(stickers.entries[1]?.[0] ?? ''), 'sticker-a');

const references = createCompactReferenceCatalog(['message-3db0baf6', 'h1']);
assert.notEqual(references.codeFor('h1'), 'h1');
assert.equal(references.resolve(references.codeFor('message-3db0baf6') ?? ''), 'message-3db0baf6');

const schema = {
  type: 'object',
  properties: {
    title: { type: 'string', minLength: 1, description: '标题' },
    repeat: { type: 'string', enum: ['daily', 'weekly'] }
  },
  required: ['title'],
  additionalProperties: false
};

const compactSchema = compactJsonSchema(schema);
assert.deepEqual(expandCompactJsonSchema(compactSchema), schema);

const tools = createCompactMcpPlannerCatalog([
  { id: 'search_notes', title: '搜索笔记', description: '查询已保存的笔记', inputSchema: schema, write: false },
  { id: 'create_note', title: '创建笔记', description: '写入一条新笔记', inputSchema: schema, write: true }
]);

assert.equal(tools.resolve(tools.entries[0]?.[0] ?? '')?.id, 'search_notes');
assert.equal(tools.entries[1]?.[4], 1);
assert.deepEqual(expandCompactJsonSchema(tools.entries[0]?.[5]), schema);

console.log('Prompt catalog regression checks passed.');