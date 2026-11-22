import fs from 'node:fs';
import path from 'node:path';
import { API_BASE, UPLOAD_BASE, apiKey, apiGet, apiPost, downloadToFile, log, sleep } from './client.js';

export interface TaskStatus {
  taskId: string;
  model?: string;
  state: 'waiting' | 'queuing' | 'generating' | 'success' | 'fail' | string;
  resultJson?: string | null;
  response?: unknown;
  failCode?: string | null;
  failMsg?: string | null;
  progress?: number;
  creditsConsumed?: number | null;
}

export async function createTask(model: string, input: Record<string, unknown>, callBackUrl?: string): Promise<string> {
  const data = await apiPost<{ taskId: string }>(`${API_BASE}/api/v1/jobs/createTask`, {
    model,
    input,
    ...(callBackUrl ? { callBackUrl } : {}),
  });
  if (!data?.taskId) throw new Error(`Task creation returned no taskId: ${JSON.stringify(data)}`);
  return data.taskId;
}

export async function taskStatus(taskId: string): Promise<TaskStatus> {
  const url = `${API_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
  return apiGet<TaskStatus>(url);
}

export interface GeneratedFile {
  url: string;
  label: string;
}

export function extractFiles(status: TaskStatus): GeneratedFile[] {
  const parsed = parseResultJson(status);
  const files: GeneratedFile[] = [];

  const pushUrls = (value: unknown, label: string): void => {
    if (typeof value === 'string') files.push({ url: value, label });
    if (Array.isArray(value)) for (const item of value) if (typeof item === 'string') files.push({ url: item, label });
  };

  pushUrls(parsed?.resultUrls ?? parsed?.result_urls, 'result');

  // Suno-style payloads nest tracks under data[] or resultObject
  const tracks = (parsed?.data ?? (parsed?.resultObject as Record<string, unknown> | undefined)?.data) as unknown;
  if (Array.isArray(tracks)) {
    for (const track of tracks) {
      if (!track || typeof track !== 'object') continue;
      const t = track as Record<string, unknown>;
      pushUrls(t.audio_url ?? t.stream_audio_url, 'audio');
      pushUrls(t.image_url, 'cover');
      pushUrls(t.video_url, 'video');
    }
  }

  return dedupe(files);
}

function parseResultJson(status: TaskStatus): Record<string, unknown> | undefined {
  for (const source of [status.response, status.resultJson]) {
    if (!source) continue;
    try {
      const obj = typeof source === 'string' ? JSON.parse(source) : source;
      if (obj && typeof obj === 'object') return obj as Record<string, unknown>;
    } catch {
      // some fields are double-encoded JSON strings
      try {
        const once = JSON.parse(source as string);
        if (typeof once === 'string') {
          const twice = JSON.parse(once) as unknown;
          if (twice && typeof twice === 'object') return twice as Record<string, unknown>;
        }
      } catch {
        // ignore unparseable payloads
      }
    }
  }
  return undefined;
}

function dedupe(files: GeneratedFile[]): GeneratedFile[] {
  const seen = new Set<string>();
  return files.filter((f) => (seen.has(f.url) ? false : (seen.add(f.url), true)));
}

export interface PollOptions {
  timeoutMs: number;
  outPath?: string | undefined;
}

export async function pollTask(taskId: string, { timeoutMs, outPath }: PollOptions): Promise<TaskStatus> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const status = await taskStatus(taskId);
    const state = status.state.toLowerCase();
    if (state === 'success') return status;
    if (state === 'fail') {
      throw new Error(`Task ${taskId} failed: ${status.failMsg || status.failCode || 'unknown error'}`);
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s. Resume with: kie status ${taskId}`);
    }
    log(`state=${state}${status.progress !== undefined ? ` progress=${status.progress}%` : ''}`);
    await sleep(state === 'waiting' || state === 'queuing' ? 2_000 : 5_000);
  }
}

export async function finishTask(taskId: string, options: PollOptions): Promise<void> {
  log(`Task created: ${taskId}`);
  const status = await pollTask(taskId, options);
  const files = extractFiles(status);

  if (files.length === 0) {
    console.log(JSON.stringify(status, null, 2));
  } else if (options.outPath) {
    const saved = await saveFiles(files, options.outPath);
    for (const file of saved) console.log(file);
  } else {
    for (const file of files) console.log(`${file.label}: ${file.url}`);
  }
  if (status.creditsConsumed != null) log(`Credits consumed: ${status.creditsConsumed}`);
}

async function saveFiles(files: GeneratedFile[], outPath: string): Promise<string[]> {
  const saved: string[] = [];
  const multi = files.length > 1;
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]!;
    const dest = multi ? insertSuffix(outPath, i + 1) : outPath;
    saved.push(await downloadToFile(file.url, dest));
  }
  return saved;
}

function insertSuffix(filePath: string, index: number): string {
  const ext = path.extname(filePath);
  return `${filePath.slice(0, filePath.length - ext.length)}-${index}${ext}`;
}

export function defaultOutPath(kind: 'image' | 'video' | 'audio', ext: string): string {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return path.join('output', `${kind}-${stamp}.${ext}`);
}

const URL_PATTERN = /^https?:\/\//i;

export async function resolveInput(source: string): Promise<string> {
  if (URL_PATTERN.test(source)) return source;
  return uploadFile(source);
}

export async function uploadFile(filePath: string): Promise<string> {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const form = new FormData();
  const bytes = fs.readFileSync(abs);
  const type = mimeForExtension(path.extname(abs));
  form.set('file', new Blob([bytes], { type }), path.basename(abs));
  form.set('uploadPath', 'kie-cli');

  const res = await fetch(`${UPLOAD_BASE}/api/file-stream-upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const body = (await res.json()) as { success?: boolean; code?: number; msg?: string; data?: { downloadUrl?: string } };
  if (!res.ok || body.success === false || body.code !== 200 || !body.data?.downloadUrl) {
    throw new Error(`Upload failed (${body.code ?? res.status}): ${body.msg ?? 'no downloadUrl'}`);
  }
  log(`Uploaded ${path.basename(abs)}`);
  return body.data.downloadUrl;
}

function mimeForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.mp4':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.flac':
      return 'audio/flac';
    default:
      return 'image/jpeg';
  }
}
