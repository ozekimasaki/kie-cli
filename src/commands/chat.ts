import readline from 'node:readline/promises';
import { API_BASE, apiKey, apiGet } from '../client.js';
import { flag, flagList, hasFlag, isJsonMode, expandAtFile, readTextFlag, type ParsedArgs } from '../cli.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: unknown;
}

interface ChatCompletion {
  choices?: { message?: { content?: string }; delta?: { content?: string }; finish_reason?: string | null }[];
  usage?: Record<string, unknown>;
  error?: unknown;
}

function chatContent(text: string, images: string[]): unknown {
  if (images.length === 0) return text;
  return [
    { type: 'text', text },
    ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
  ];
}

export async function chatCommand(sub: string | undefined, { positional, flags, repeats }: ParsedArgs): Promise<void> {
  if (sub === 'models' || flags.models === true) return chatModels(flags);
  apiKey();

  const model = flag(flags, 'model') ?? process.env.KIE_CHAT_MODEL;
  if (!model) {
    throw new Error('Specify a model with --model <id> (see "kie chat models"). Example: kie chat --model gpt-5.2 "hello"');
  }

  const messages: ChatMessage[] = [];
  const system = readTextFlag(flags, 'system');
  if (system) messages.push({ role: 'system', content: system });

  const firstMessage = sub === undefined ? positional.join(' ') : `${sub} ${positional.join(' ')}`.trim();
  const images = flagList(repeats, flags, 'image');

  if (firstMessage) {
    messages.push({ role: 'user', content: chatContent(expandAtFile(firstMessage), images) });
    await completeOnce(model, messages, flags);
    return;
  }
  await repl(model, messages, images, flags);
}

async function chatModels(flags: Record<string, string | boolean>): Promise<void> {
  const protocol = flag(flags, 'protocol') ?? 'openai';
  const base = protocol === 'anthropic' ? `${API_BASE}/anthropic/v1/models` : `${API_BASE}/openai/v1/models`;
  const data = await apiGet<{ data?: { id?: string }[] }>(base);
  const ids = (data.data ?? []).map((m) => m.id ?? String(m));
  if (isJsonMode(flags)) console.log(JSON.stringify(ids, null, 2));
  else {
    console.log(`${protocol} chat models (${ids.length}):`);
    for (const id of ids) console.log(`  ${id}`);
  }
}

async function completeOnce(model: string, messages: ChatMessage[], flags: Record<string, string | boolean>): Promise<void> {
  if (isJsonMode(flags) || hasFlag(flags, 'no-stream')) {
    const res = await postCompletion(model, messages, false);
    const json = (await res.json()) as ChatCompletion;
    if (isJsonMode(flags)) console.log(JSON.stringify(json, null, 2));
    else console.log(json.choices?.[0]?.message?.content ?? '');
    return;
  }
  const res = await postCompletion(model, messages, true);
  await streamCompletion(res);
  console.log();
}

async function postCompletion(model: string, messages: ChatMessage[], stream: boolean): Promise<Response> {
  const res = await fetch(`${API_BASE}/openai/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, stream }),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || !contentType.includes('event-stream') === stream) {
    const text = await res.text().catch(() => '');
    throw new Error(`Chat request failed (HTTP ${res.status}): ${text.slice(0, 400)}`);
  }
  return res;
}

async function streamCompletion(res: Response): Promise<string> {
  const body = res.body;
  if (!body) throw new Error('Empty stream response');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return answer;
      try {
        const chunk = JSON.parse(payload) as ChatCompletion;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          answer += delta;
          process.stdout.write(delta);
        }
      } catch {
        // ignore keep-alive or partial frames
      }
    }
  }
  return answer;
}

async function repl(model: string, history: ChatMessage[], images: string[], flags: Record<string, string | boolean>): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Chatting with ${model} (streaming). Type /exit to quit, /reset to clear history.`);
  const stream = !hasFlag(flags, 'no-stream');
  for (;;) {
    const input = (await rl.question('you> ')).trim();
    if (!input) continue;
    if (input === '/exit' || input === '/quit') break;
    if (input === '/reset') {
      history.length = history.filter((m) => m.role === 'system').length;
      continue;
    }
    history.push({ role: 'user', content: chatContent(input, images) });
    if (stream) {
      const res = await postCompletion(model, history, true);
      const answer = await streamCompletion(res);
      process.stdout.write('\n');
      history.push({ role: 'assistant', content: answer });
    } else {
      const res = await postCompletion(model, history, false);
      const json = (await res.json()) as ChatCompletion;
      const answer = json.choices?.[0]?.message?.content ?? '';
      console.log(`kie> ${answer}`);
      history.push({ role: 'assistant', content: answer });
    }
  }
  rl.close();
}
