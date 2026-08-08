export interface PromptCatalogItem {
  id: string;
  description: string;
}

export interface CompactStickerPromptCatalog {
  entries: Array<[code: string, description: string]>;
  resolve(code: string): string | undefined;
}

export interface CompactReferenceCatalog {
  codeFor(id: string): string | undefined;
  resolve(code: string): string | undefined;
}

const schemaKeyAliases: Record<string, string> = {
  type: 't',
  properties: 'p',
  required: 'r',
  description: 'd',
  enum: 'e',
  items: 'i',
  minimum: 'min',
  maximum: 'max',
  minLength: 'minL',
  maxLength: 'maxL',
  minItems: 'minI',
  maxItems: 'maxI',
  format: 'fmt',
  default: 'def',
  additionalProperties: 'ap',
  oneOf: 'one',
  anyOf: 'any',
  allOf: 'all',
  const: 'c',
  pattern: 'pat',
  '$ref': 'ref',
  '$defs': 'defs'
};

const schemaAliasKeys = new Map(Object.entries(schemaKeyAliases).map(([key, alias]) => [alias, key]));

function createUnusedCodes(values: readonly string[], count: number, prefix: string) {
  const reservedValues = new Set(values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean));
  const codes: string[] = [];
  let index = 1;
  while (codes.length < count) {
    let code = `${prefix}${index}`;
    while (reservedValues.has(code.toLocaleLowerCase())) {
      index += 1;
      code = `${prefix}${index}`;
    }
    codes.push(code);
    index += 1;
  }
  return codes;
}

export function createCompactStickerPromptCatalog(stickers: readonly PromptCatalogItem[]): CompactStickerPromptCatalog {
  const validStickers = stickers.filter((sticker) => sticker.id.trim());
  const codes = createUnusedCodes(validStickers.flatMap((sticker) => [sticker.id, sticker.description]), validStickers.length, 's');
  const codesByLowerCase = new Map(codes.map((code, index) => [code.toLocaleLowerCase(), validStickers[index]!.id]));
  return {
    entries: validStickers.map((sticker, index) => [codes[index]!, sticker.description]),
    resolve(code) {
      return codesByLowerCase.get(code.trim().toLocaleLowerCase());
    }
  };
}

export function createCompactReferenceCatalog(ids: readonly string[], prefix = 'h'): CompactReferenceCatalog {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const codes = createUnusedCodes(uniqueIds, uniqueIds.length, prefix);
  const codesById = new Map(uniqueIds.map((id, index) => [id, codes[index]!]));
  const idsByCode = new Map(codes.map((code, index) => [code.toLocaleLowerCase(), uniqueIds[index]!]));
  return {
    codeFor(id) {
      return codesById.get(id.trim());
    },
    resolve(code) {
      return idsByCode.get(code.trim().toLocaleLowerCase());
    }
  };
}

export function compactJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => compactJsonSchema(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [schemaKeyAliases[key] ?? key, compactJsonSchema(nested)]));
}

export function expandCompactJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => expandCompactJsonSchema(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, nested]) => [schemaAliasKeys.get(key) ?? key, expandCompactJsonSchema(nested)]));
}

export interface CompactMcpPlannerCatalog<T extends PromptCatalogItem & { title: string; inputSchema: unknown; write: boolean }> {
  entries: Array<[code: string, name: string, title: string, description: string, write: 0 | 1, schema: unknown]>;
  resolve(code: string): T | undefined;
}

export function createCompactMcpPlannerCatalog<T extends PromptCatalogItem & { title: string; inputSchema: unknown; write: boolean }>(tools: readonly T[]): CompactMcpPlannerCatalog<T> {
  const codes = createUnusedCodes(tools.map((tool) => tool.id), tools.length, 'm');
  const toolsByCode = new Map(codes.map((code, index) => [code.toLocaleLowerCase(), tools[index]!])) as Map<string, T>;
  return {
    entries: tools.map((tool, index) => [
      codes[index]!,
      tool.id,
      tool.title,
      tool.description,
      tool.write ? 1 : 0,
      compactJsonSchema(tool.inputSchema)
    ]),
    resolve(code) {
      return toolsByCode.get(code.trim().toLocaleLowerCase());
    }
  };
}