import fs from 'node:fs';

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
  repeats: Record<string, string[]>;
}

export function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const repeats: Record<string, string[]> = {};
  const record = (name: string, value: string): void => {
    (repeats[name] ??= []).push(value);
    flags[name] = value;
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        record(arg.slice(2, eq), arg.slice(eq + 1));
      } else if (i + 1 < args.length && !args[i + 1]!.startsWith('--')) {
        record(arg.slice(2), args[++i]!);
      } else {
        flags[arg.slice(2)] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags, repeats };
}

export function flagList(repeats: Record<string, string[]>, flags: Record<string, string | boolean>, name: string): string[] {
  const repeated = repeats[name];
  if (repeated) return repeated;
  const single = flag(flags, name);
  return single ? single.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export function flag(flags: Record<string, string | boolean>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === 'string' ? value : undefined;
}

export function hasFlag(flags: Record<string, string | boolean>, name: string): boolean {
  return flags[name] !== undefined;
}

export function readJsonFlag(flags: Record<string, string | boolean>, name: string): Record<string, unknown> {
  const raw = flag(flags, name);
  if (!raw) return {};
  const text = raw.startsWith('@') ? fs.readFileSync(raw.slice(1), 'utf8') : raw;
  return JSON.parse(text) as Record<string, unknown>;
}

export function readTextFlag(flags: Record<string, string | boolean>, name: string): string | undefined {
  const raw = flag(flags, name);
  if (!raw) return undefined;
  return raw.startsWith('@') ? fs.readFileSync(raw.slice(1), 'utf8') : raw;
}

export function isJsonMode(flags: Record<string, string | boolean>): boolean {
  return flags.json === true || flags.json === 'true';
}

export function parseTimeoutSeconds(value: string | undefined, fallback: number): number {
  return value ? Number(value) * 1000 : fallback;
}

const HELP_TEXT: Record<string, string> = {
  global: `kie — kie.ai CLI

Usage: kie <command> [options]

Commands:
  models                     List available models (--task --provider --q --json)
  balance                    Show remaining credits (--json)
  image gen|ref|edit         Generate / reference-based generate / edit images
  video gen                  Generate videos
  music gen                  Generate music (Suno)
  chat [message...]          Talk to an LLM (OpenAI-compatible; REPL without a message)
  chat models                List chat models (--protocol openai|anthropic)
  run <model> --input JSON   Call any market model with raw parameters
  status <taskId>            Check an async task (--wait --out)
  upload <file>              Upload a local file, prints a hosted URL
  config set-key|show|clear  Store your API key (~/.kie/config.json)

Environment:
  KIE_API_KEY                API key (--api-key / saved config are also used)
  KIE_API_BASE               API base, default https://api.kie.ai
  KIE_CHAT_MODEL             Default model for "kie chat"

Key resolution order: --api-key > KIE_API_KEY > saved config.

Run "kie help <command>" for command options.`,
  config: `kie config set-key [key]     Save key (interactive hidden prompt without argument)
kie config show              Show config path and masked key
kie config clear             Remove the saved key

Stored in ~/.kie/config.json with mode 0600 (override location with KIE_CONFIG).`,
  image: `kie image gen "prompt" [--model google/nano-banana] [--ref <file|url>]... [--aspect 1:1|16:9|9:16|auto] [--format png|jpeg] [--resolution 1K|2K|4K] [--out path] [--auto-out] [--timeout seconds] [--input JSON] [--callback URL]
kie image ref "prompt" --ref <file|url> ...   Reference-based generation (default model nano-banana-2-1, up to 10 images)
kie image edit "prompt" --image <file|url> ... [--model google/nano-banana-edit] [same output options]   Edit with up to 10 input images

Local files are uploaded automatically first (kie upload). Without --out, result URLs are printed.`,
  video: `kie video gen "prompt" [--model bytedance/seedance-2-5] [--image first-frame] [--last-frame f] [--ref-image url]... [--ref-video url]... [--ref-audio url]... [--aspect 16:9] [--resolution 1080p] [--duration 5] [--audio|--no-audio] [--format mp4] [--out path] [--auto-out] [--timeout seconds] [--input JSON] [--callback URL]

Default wait timeout is 30 minutes; video tasks can take several.`,
  music: `kie music gen "description" [--style "Jazz, Lo-fi"] [--version V6|V6_MINI|V6_WILD] [--instrumental] [--negative tags] [--vocal m|f] [--title X] [--out path] [--auto-out] [--timeout seconds] [--input JSON]
kie music gen --lyrics @song.txt --title "Song name"    Custom mode with your own lyrics

Result tracks are printed as audio/cover URLs; --out saves the first track, multiple tracks get a -1/-2 suffix.`,
  chat: `kie chat --model <id> "question" [--system instr] [--image url]... [--no-stream] [--json]
kie chat --model <id>            Interactive REPL (/exit, /reset)
kie chat models [--protocol openai|anthropic]

Uses the OpenAI-compatible endpoint (KIE_API_BASE)/openai/v1/chat/completions. Streaming is on by default.`,
  models: `kie models [--task "Text to Image"] [--provider Google] [--q veo] [--json]

With KIE_API_KEY set, queries GET /api/v1/models; otherwise falls back to the public playground catalog.`,
};

export function HELP(topic = ''): string {
  if (topic && HELP_TEXT[topic]) return HELP_TEXT[topic]!;
  return HELP_TEXT.global!;
}
