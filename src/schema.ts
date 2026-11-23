import { log } from './client.js';

const DOCS_BASE = 'https://docs.kie.ai';

export interface FieldDef {
  name: string;
  type?: string | undefined;
  required: boolean;
  enum?: string[] | undefined;
  default?: string | undefined;
  deprecated?: boolean | undefined;
  maxLength?: number | undefined;
  description?: string | undefined;
}

export interface ModelSchema {
  docsUrl: string;
  fields: FieldDef[];
}

type Yaml = string | Yaml[] | { [key: string]: Yaml };

interface Line {
  indent: number;
  text: string;
}

function splitEntry(text: string): [string, string] {
  const colon = findKeyColon(text);
  if (colon === -1) return [unquote(text.trim()), ''];
  return [unquote(text.slice(0, colon).trim()), text.slice(colon + 1).trim()];
}

function findKeyColon(text: string): number {
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ':' && (i + 1 === text.length || text[i + 1] === ' ')) return i;
  }
  return -1;
}

function unquote(value: string): string {
  const first = value[0];
  if ((first === "'" || first === '"') && value.endsWith(first) && value.length > 1) {
    return value.slice(1, -1);
  }
  return value;
}

function parseBlock(lines: Line[], start: number, indent: number): [Yaml, number] {
  if (start >= lines.length) return [{}, start];
  if (lines[start]!.text.startsWith('- ')) {
    const items: Yaml[] = [];
    let i = start;
    while (i < lines.length && lines[i]!.indent === indent && lines[i]!.text.startsWith('- ')) {
      const rest = lines[i]!.text.slice(2).trim();
      i += 1;
      if (rest === '' || rest === '>' || rest === '>-' || rest === '|' || rest === '|-') {
        const [block, next] = readFolded(lines, i, indent);
        items.push(block);
        i = next;
      } else if (rest.startsWith('- ')) {
        const inner = indent + 2;
        lines[i - 1] = { indent: inner, text: rest };
        const [node, next] = parseBlock(lines, i - 1, inner);
        items.push(node);
        i = next;
      } else if (findKeyColon(rest) !== -1) {
        const inner = i < lines.length && lines[i]!.indent > indent ? lines[i]!.indent : indent + 2;
        lines[i - 1] = { indent: inner, text: rest };
        const [node, next] = parseBlock(lines, i - 1, inner);
        items.push(node);
        i = next;
      } else {
        items.push(unquote(rest));
      }
    }
    return [items, i];
  }
  const map: Record<string, Yaml> = {};
  let i = start;
  while (i < lines.length && lines[i]!.indent === indent) {
    const [key, rest] = splitEntry(lines[i]!.text);
    i += 1;
    if (!key) continue;
    if (rest === '' ) {
      if (i < lines.length && lines[i]!.indent > indent) {
        const [child, next] = parseBlock(lines, i, lines[i]!.indent);
        map[key] = child;
        i = next;
      } else {
        map[key] = {};
      }
    } else if (rest === '>' || rest === '>-' || rest === '|' || rest === '|-') {
      const [block, next] = readFolded(lines, i, indent);
      map[key] = block;
      i = next;
    } else if (rest === '[]') {
      map[key] = [];
    } else if (rest === '{}') {
      map[key] = {};
    } else {
      map[key] = unquote(rest);
    }
  }
  return [map, i];
}

function readFolded(lines: Line[], start: number, indent: number): [string, number] {
  const parts: string[] = [];
  let i = start;
  while (i < lines.length && lines[i]!.indent > indent) {
    parts.push(lines[i]!.text);
    i += 1;
  }
  return [parts.join(' '), i];
}

function parseYaml(src: string): Record<string, Yaml> {
  const lines: Line[] = [];
  for (const raw of src.split(/\r?\n/)) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    lines.push({ indent: raw.length - raw.trimStart().length, text: raw.trim() });
  }
  const [root] = parseBlock(lines, 0, 0);
  return typeof root === 'object' && !Array.isArray(root) ? root : {};
}

function obj(value: Yaml | undefined): Record<string, Yaml> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function str(value: Yaml | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringList(value: Yaml | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((v): v is string => typeof v === 'string');
  return list.length > 0 ? list : undefined;
}

export function parseCreateTaskSchema(markdown: string): FieldDef[] | undefined {
  const yaml = markdown.match(/```yaml\n([\s\S]*?)```/);
  if (!yaml) return undefined;
  const root = parseYaml(yaml[1]!);
  const paths = obj(root.paths);
  let createTask: Record<string, Yaml> | undefined;
  for (const [path, node] of Object.entries(paths)) {
    if (path.includes('createTask')) {
      createTask = obj(node);
      break;
    }
  }
  if (!createTask) return undefined;
  const method = obj(createTask.post ?? createTask.put);
  const content = obj(obj(method.requestBody).content);
  const body = obj(obj(content['application/json'] ?? content['application/x-www-form-urlencoded']).schema);
  const properties = obj(body.properties);
  const input = obj(properties.input);
  const inputProps = obj(input.properties);
  const requiredInput = new Set(asStringList(input.required) ?? []);
  const fields: FieldDef[] = [];
  for (const [name, def] of Object.entries(inputProps)) {
    const node = obj(def);
    const maxLength = Number(str(node.maxLength));
    fields.push({
      name,
      type: str(node.type),
      required: requiredInput.has(name),
      enum: asStringList(node.enum),
      default: str(node.default),
      deprecated: node.deprecated === 'true',
      maxLength: Number.isFinite(maxLength) ? maxLength : undefined,
      description: str(node.description),
    });
  }
  return fields.length > 0 ? fields : undefined;
}

function tokensOf(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1);
}

async function tryFetchText(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return undefined;
    const text = await res.text();
    return text.includes('<!DOCTYPE') || text.includes('<html') ? undefined : text;
  } catch {
    return undefined;
  }
}

const DOC_ALIASES: Record<string, string> = {
  'ai-music-api/generate': '/suno-api/generate-music.md',
  // kie.ai id has no hyphens in its docs slug
  'nano-banana-2-1': '/market/google/nanobanana-2-1.md',
};

async function findDocUrl(model: string, fuzzy: boolean): Promise<string | undefined> {
  const alias = DOC_ALIASES[model];
  if (alias && (await tryFetchText(`${DOCS_BASE}${alias}`)) !== undefined) return `${DOCS_BASE}${alias}`;
  const direct = `${DOCS_BASE}/market/${model}.md`;
  if (await tryFetchText(direct) !== undefined) return direct;
  if (!fuzzy) return undefined;
  const index = await tryFetchText(`${DOCS_BASE}/llms.txt`);
  if (!index) return undefined;
  const wanted = tokensOf(model);
  const compactModel = model.toLowerCase().replace(/[^a-z0-9]/g, '');
  let best: { url: string; score: number } | undefined;
  for (const match of index.matchAll(/\((https:\/\/docs\.kie\.ai\/(?:[a-z]{2}\/)?market\/[^)]+\.md)\)/g)) {
    const url = match[1]!;
    if (url.includes('/cn/') || url.includes('/jp/') || url.includes('/kr/')) continue;
    const tail = url.replace(`${DOCS_BASE}/market/`, '').replace('.md', '');
    const candidates = tokensOf(tail);
    let score = 0;
    for (const token of wanted) if (candidates.includes(token)) score += 1;
    if (compactModel.length >= 6 && tail.toLowerCase().replace(/[^a-z0-9]/g, '').includes(compactModel)) score += 10;
    if (!best || score > best.score) best = { url, score };
  }
  return best && best.score >= 2 ? best.url : undefined;
}

const schemaCache = new Map<string, ModelSchema | null>();

export async function getModelSchema(model: string, fuzzy = true): Promise<ModelSchema | null> {
  const cacheKey = `${fuzzy ? 'f' : 'd'}|${model}`;
  if (schemaCache.has(cacheKey)) return schemaCache.get(cacheKey) ?? null;
  const url = await findDocUrl(model, fuzzy);
  const md = url ? await tryFetchText(url) : undefined;
  const fields = md ? parseCreateTaskSchema(md) : undefined;
  const schema = url && fields ? { docsUrl: url, fields } : null;
  schemaCache.set(cacheKey, schema);
  return schema;
}

export async function checkInput(model: string, input: Record<string, unknown>, strict: boolean, fuzzy = false): Promise<void> {
  const schema = await getModelSchema(model, fuzzy);
  if (!schema) return;
  const problems: string[] = [];
  const known = new Map(schema.fields.map((f) => [f.name, f]));
  for (const key of Object.keys(input)) {
    const field = known.get(key);
    if (!field) {
      problems.push(`"${key}" is not an input parameter of ${model} (kie ignores unknown fields)`);
      continue;
    }
    if (field.deprecated) problems.push(`"${key}" is deprecated: ${field.description ?? 'use the replacement parameter'}`);
    const value = input[key];
    if (field.enum && typeof value === 'string' && !field.enum.includes(value)) {
      problems.push(`${key}="${value}" is outside the enum: ${field.enum.join('|')}`);
    }
    if (field.maxLength && typeof value === 'string' && value.length > field.maxLength) {
      problems.push(`${key} exceeds maxLength ${field.maxLength} (got ${value.length})`);
    }
  }
  for (const field of schema.fields) {
    if (field.required && input[field.name] === undefined) problems.push(`required parameter "${field.name}" is missing`);
  }
  if (problems.length === 0) return;
  const message = `schema check for ${model}:\n  - ${problems.join('\n  - ')}\n  docs: ${schema.docsUrl}`;
  if (strict) throw new Error(message);
  log(`warning: ${message}`);
}

export function formatSchema(schema: ModelSchema): string {
  const rows = schema.fields.map((f) => {
    const flags = [f.required ? 'required' : '', f.deprecated ? 'deprecated' : ''].filter(Boolean).join(',');
    const allowed = f.enum ? `enum: ${f.enum.join('|')}` : f.type ?? '';
    const desc = (f.description ?? '').slice(0, 70);
    return `  ${f.name.padEnd(22)} ${allowed.padEnd(46)} ${flags.padEnd(18)} ${desc}`;
  });
  return `input parameters for the model behind ${schema.docsUrl}:\n${rows.join('\n')}\n\ndocs: ${schema.docsUrl}`;
}
