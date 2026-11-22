import { API_BASE, apiKey, apiGet, apiPost, clearApiKey, CONFIG_PATH, isApiKeyAvailable, log, saveApiKey } from '../client.js';
import { flag, isJsonMode, parseTimeoutSeconds, readJsonFlag, type ParsedArgs } from '../cli.js';
import { createTask, defaultOutPath, extractFiles, finishTask, taskStatus, uploadFile } from '../task.js';

interface CatalogModel {
  model?: string;
  slug?: string;
  title?: string;
  provider?: string;
  taskType?: string[] | string;
}

export async function modelsCommand({ flags }: ParsedArgs): Promise<void> {
  const filters = {
    task: flag(flags, 'task') ?? '',
    provider: flag(flags, 'provider') ?? '',
    q: flag(flags, 'q') ?? '',
  };
  const models = await listModels(filters);
  if (isJsonMode(flags)) {
    console.log(JSON.stringify(models, null, 2));
    return;
  }
  console.log(`kie.ai models (${models.length}):`);
  for (const m of models) {
    const id = String(m.model ?? m.slug ?? '');
    const tasks = Array.isArray(m.taskType) ? m.taskType.join(',') : String(m.taskType ?? '');
    console.log(`  ${id.padEnd(40)} ${String(m.provider ?? '-').padEnd(14)} ${tasks.padEnd(28)} ${m.title ?? ''}`);
  }
}

async function listModels(filters: { task: string; provider: string; q: string }): Promise<CatalogModel[]> {
  if (isApiKeyAvailable()) {
    const params = new URLSearchParams();
    if (filters.task) params.set('taskType', filters.task);
    if (filters.provider) params.set('provider', filters.provider);
    if (filters.q) params.set('q', filters.q);
    const qs = params.toString();
    const data = await apiGet<{ models?: CatalogModel[] }>(`${API_BASE}/api/v1/models${qs ? `?${qs}` : ''}`);
    return data.models ?? [];
  }
  log('No API key: falling back to the public catalog (some entries may be hidden).');
  return listPublicCatalog(filters);
}

async function listPublicCatalog({ provider, q }: { task: string; provider: string; q: string }): Promise<CatalogModel[]> {
  const rows: Record<string, unknown>[] = [];
  for (let pageNum = 1; pageNum <= 20; pageNum += 1) {
    const raw = await apiPost<unknown>(
      `${API_BASE}/api/v1/playground/pagePlaygroundGroup`,
      {
        pageNum,
        pageSize: 100,
        groupName: q,
        tasks: [],
        provider: [],
      },
      { auth: false },
    );
    const list = Array.isArray(raw) ? raw : ((raw as { records?: unknown[] })?.records ?? []);
    rows.push(...(list as Record<string, unknown>[]));
    if (list.length < 100) break;
  }
  return rows
    .filter((g) => !/\(coming soon\)/i.test(String(g.groupName ?? '')) && Number(g.count ?? 1) !== 0)
    .filter((g) => !provider || String(g.provider ?? '').toLowerCase().includes(provider.toLowerCase()))
    .map((g) => ({
      model: String(g.path ?? '').replace(/^\/+/, ''),
      title: String(g.groupName ?? ''),
      provider: String(g.provider ?? ''),
      taskType: (g.taskType as string[] | undefined) ?? [],
    }));
}

export async function balanceCommand({ flags }: ParsedArgs): Promise<void> {
  const credits = await apiGet<number>(`${API_BASE}/api/v1/chat/credit`);
  if (isJsonMode(flags)) {
    console.log(JSON.stringify({ credits }, null, 2));
  } else {
    console.log(`Available credits: ${credits}`);
  }
}

export async function statusCommand({ positional, flags }: ParsedArgs): Promise<void> {
  const taskId = positional[0];
  if (!taskId) throw new Error('Usage: kie status <taskId> [--wait seconds] [--out path]');
  if (flag(flags, 'wait')) {
    await finishTask(taskId, {
      timeoutMs: parseTimeoutSeconds(flag(flags, 'timeout'), 30 * 60_000),
      outPath: flag(flags, 'out'),
    });
    return;
  }
  const status = await taskStatus(taskId);
  if (isJsonMode(flags)) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(`task:  ${status.taskId}`);
  console.log(`model: ${status.model ?? '-'}`);
  console.log(`state: ${status.state}${status.progress !== undefined ? ` (${status.progress}%)` : ''}`);
  if (status.failMsg) console.log(`error: ${status.failMsg}`);
  for (const f of extractFiles(status)) console.log(`${f.label}: ${f.url}`);
  if (status.creditsConsumed != null) console.log(`credits consumed: ${status.creditsConsumed}`);
}

export async function runCommand({ positional, flags }: ParsedArgs): Promise<void> {
  const model = positional[0];
  if (!model) throw new Error('Usage: kie run <model> --input \'{"prompt":"..."}\' [--wait] [--out path]');
  const input = { ...readJsonFlag(flags, 'input'), ...(flag(flags, 'prompt') ? { prompt: flag(flags, 'prompt') } : {}) };
  const taskId = await createTask(model, input, flag(flags, 'callback'));
  if (hasNoWait(flags)) {
    console.log(taskId);
    return;
  }
  const kind = detectKind(model);
  await finishTask(taskId, {
    timeoutMs: parseTimeoutSeconds(flag(flags, 'timeout'), kind === 'video' || kind === 'audio' ? 30 * 60_000 : 10 * 60_000),
    outPath: flag(flags, 'out') ?? (flags['auto-out'] ? defaultOutPath(kind, 'bin') : undefined),
  });
}

function hasNoWait(flags: Record<string, string | boolean>): boolean {
  return flags['no-wait'] === true || flags['no-wait'] === 'true';
}

function detectKind(model: string): 'image' | 'video' | 'audio' {
  if (/video|veo|kling|seedance|hailuo|runway|wan/i.test(model)) return 'video';
  if (/music|suno|audio|speech|voice|tts/i.test(model)) return 'audio';
  return 'image';
}

export async function uploadCommand({ positional }: ParsedArgs): Promise<void> {
  const file = positional[0];
  if (!file) throw new Error('Usage: kie upload <file>');
  apiKey();
  console.log(await uploadFile(file));
}
