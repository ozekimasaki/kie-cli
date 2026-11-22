import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const API_BASE = (process.env.KIE_API_BASE ?? 'https://api.kie.ai').replace(/\/+$/, '');
export const UPLOAD_BASE = (process.env.KIE_UPLOAD_BASE ?? 'https://kieai.redpandaai.co').replace(/\/+$/, '');
export const CONFIG_PATH = process.env.KIE_CONFIG ?? path.join(os.homedir(), '.kie', 'config.json');

let cachedKey: string | undefined;

export function setApiKey(key: string | undefined): void {
  cachedKey = key;
}

interface KieConfig {
  apiKey?: string;
}

function readConfig(): KieConfig {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as KieConfig;
  } catch {
    return {};
  }
}

export function saveApiKey(key: string): void {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const config = readConfig();
  config.apiKey = key.trim();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(CONFIG_PATH, 0o600);
}

export function clearApiKey(): boolean {
  const config = readConfig();
  if (config.apiKey === undefined) return false;
  delete config.apiKey;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  return true;
}

function resolveKey(): string | undefined {
  return (cachedKey ?? process.env.KIE_API_KEY ?? readConfig().apiKey ?? '').trim() || undefined;
}

export function apiKey(): string {
  const key = resolveKey();
  if (!key) {
    throw new Error('Missing API key. Run: kie config set-key <key> (or export KIE_API_KEY). Create one at https://kie.ai/api-key');
  }
  return key;
}

export function isApiKeyAvailable(): boolean {
  return resolveKey() !== undefined;
}

interface Envelope<T> {
  code?: number;
  msg?: string;
  data?: T;
  success?: boolean;
}

const TIMEOUT_DEFAULT = 30_000;

export class KieError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

export async function apiJson<T>(url: string, init: RequestInit = {}, options: { auth?: boolean } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const auth = options.auth ?? true;
  if (auth && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${apiKey()}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_DEFAULT) });
  const text = await res.text();
  let body: Envelope<T>;
  try {
    body = JSON.parse(text) as Envelope<T>;
  } catch {
    throw new KieError(`HTTP ${res.status}, non-JSON response from ${url}: ${text.slice(0, 200)}`, res.status);
  }
  const code = body.code ?? res.status;
  if (!res.ok || (code !== undefined && code !== 200) || body.success === false) {
    throw new KieError(`kie.ai error (${code}): ${body.msg ?? text.slice(0, 200)}`, code);
  }
  return body.data as T;
}

export async function apiGet<T>(url: string, options?: { auth?: boolean }): Promise<T> {
  return apiJson<T>(url, {}, options);
}

export async function apiPost<T>(url: string, payload: unknown, options?: { auth?: boolean }): Promise<T> {
  return apiJson<T>(url, { method: 'POST', body: JSON.stringify(payload) }, options);
}

export function log(message: string): void {
  console.error(`[kie] ${message}`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function downloadToFile(url: string, dest: string): Promise<string> {
  fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });
  const res = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok) throw new KieError(`Failed to download ${url}: HTTP ${res.status}`, res.status);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}
