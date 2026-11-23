import { createTask, defaultOutPath, finishTask, resolveInput } from '../task.js';
import { checkInput } from '../schema.js';
import { flag, flagList, hasFlag, parseTimeoutSeconds, promptFrom, readJsonFlag, readTextFlag, type ParsedArgs } from '../cli.js';

export async function imageCommand(sub: string | undefined, args: ParsedArgs): Promise<void> {
  switch (sub) {
    case 'gen':
      return imageGen(args, false);
    case 'ref':
      return imageGen(args, true);
    case 'edit':
      return imageEdit(args);
    default:
      throw new Error(`Usage: kie image <gen|ref|edit> ... (run "kie help image" for options)`);
  }
}

async function imageGen({ positional, flags, repeats }: ParsedArgs, withRefs: boolean): Promise<void> {
  const refs = [...flagList(repeats, flags, 'ref'), ...flagList(repeats, flags, 'image')];
  const prompt = promptFrom(positional, flags);
  if (!prompt) throw new Error('Usage: kie image gen "prompt" [--ref image-or-url ...]');

  const usingBuiltinRefModel = refs.length > 0 && !flag(flags, 'model');
  const model = flag(flags, 'model') ?? (withRefs || refs.length > 0 ? 'nano-banana-2-1' : 'google/nano-banana');

  const input: Record<string, unknown> = { prompt, ...readJsonFlag(flags, 'input') };
  if (refs.length > 0) {
    const urls = await mapAll(refs, resolveInput);
    input[usingBuiltinRefModel || model.includes('nano-banana-2') ? 'image_input' : 'image_urls'] = urls;
  }
  putIf(input, 'aspect_ratio', flag(flags, 'aspect'));
  putIf(input, 'output_format', flag(flags, 'format'));
  putIf(input, 'resolution', flag(flags, 'resolution'));
  if (hasFlag(flags, 'nsfw-checker')) input.nsfw_checker = true;

  await submit(model, input, flags, 'png');
}

async function imageEdit({ positional, flags, repeats }: ParsedArgs): Promise<void> {
  const images = flagList(repeats, flags, 'image');
  if (images.length === 0) throw new Error('Usage: kie image edit "prompt" --image <file|url> [--image ...]');
  const prompt = promptFrom(positional, flags);
  if (!prompt) throw new Error('kie image edit requires a prompt (positional or --prompt)');

  const model = flag(flags, 'model') ?? 'google/nano-banana-edit';
  const input: Record<string, unknown> = { prompt, image_urls: await mapAll(images, resolveInput), ...readJsonFlag(flags, 'input') };
  putIf(input, 'aspect_ratio', flag(flags, 'aspect'));
  putIf(input, 'output_format', flag(flags, 'format'));

  await submit(model, input, flags, 'png');
}

async function submit(model: string, input: Record<string, unknown>, flags: Record<string, string | boolean>, ext: string): Promise<void> {
  await checkInput(model, input, flags.strict === true);
  const out = flag(flags, 'out') ?? (flags['auto-out'] ? defaultOutPath('image', String(input.output_format ?? ext)) : undefined);
  const taskId = await createTask(model, input, flag(flags, 'callback'));
  await finishTask(taskId, { timeoutMs: parseTimeoutSeconds(flag(flags, 'timeout'), 10 * 60_000), outPath: out });
}

export async function videoCommand(sub: string | undefined, args: ParsedArgs): Promise<void> {
  if (sub !== 'gen') throw new Error('Usage: kie video gen "prompt" [options] (run "kie help video")');
  const { positional, flags, repeats } = args;
  const prompt = promptFrom(positional, flags);
  if (!prompt && !flag(flags, 'image')) throw new Error('Usage: kie video gen "prompt" [--image first-frame] [--ref-image ...]');

  const model = flag(flags, 'model') ?? 'bytedance/seedance-2-5';
  const input: Record<string, unknown> = { ...readJsonFlag(flags, 'input') };
  if (prompt) input.prompt = prompt;
  const firstFrame = flag(flags, 'image') ?? flag(flags, 'first-frame');
  if (firstFrame) input.first_frame_url = await resolveInput(firstFrame);
  if (flag(flags, 'last-frame')) input.last_frame_url = await resolveInput(flag(flags, 'last-frame')!);
  for (const [name, key] of [
    ['ref-image', 'reference_image_urls'],
    ['ref-video', 'reference_video_urls'],
    ['ref-audio', 'reference_audio_urls'],
  ] as const) {
    const refs = flagList(repeats, flags, name);
    if (refs.length > 0) input[key] = await mapAll(refs, resolveInput);
  }
  putIf(input, 'aspect_ratio', flag(flags, 'aspect'));
  putIf(input, 'resolution', flag(flags, 'resolution'));
  putIf(input, 'output_format', flag(flags, 'format'));
  const duration = flag(flags, 'duration');
  if (duration) input.duration = Number(duration);
  if (hasFlag(flags, 'audio')) input.generate_audio = true;
  if (hasFlag(flags, 'no-audio')) input.generate_audio = false;

  const out = flag(flags, 'out') ?? (flags['auto-out'] ? defaultOutPath('video', String(input.output_format ?? 'mp4')) : undefined);
  await checkInput(model, input, flags.strict === true);
  const taskId = await createTask(model, input, flag(flags, 'callback'));
  await finishTask(taskId, { timeoutMs: parseTimeoutSeconds(flag(flags, 'timeout'), 30 * 60_000), outPath: out });
}

export async function musicCommand(sub: string | undefined, args: ParsedArgs): Promise<void> {
  if (sub !== 'gen') throw new Error('Usage: kie music gen "prompt" [options] (run "kie help music")');
  const { positional, flags } = args;
  const lyrics = readTextFlag(flags, 'lyrics');
  const prompt = promptFrom(positional, flags);
  const custom = lyrics !== undefined;

  const input: Record<string, unknown> = {
    model: flag(flags, 'version') ?? 'V6',
    custom_mode: custom,
    instrumental: flags.instrumental === true || flags.instrumental === 'true',
    ...readJsonFlag(flags, 'input'),
  };
  if (custom) {
    input.prompt = lyrics;
    input.title = flag(flags, 'title') ?? titleFrom(prompt ?? String(input.prompt));
  } else if (prompt) {
    input.prompt = prompt;
    putIf(input, 'style', flag(flags, 'style'));
    putIf(input, 'title', flag(flags, 'title'));
  } else {
    throw new Error('Usage: kie music gen "description" [--style X] [--instrumental] or kie music gen --lyrics @song.txt --title "Name"');
  }
  putIf(input, 'negative_tags', flag(flags, 'negative'));
  putIf(input, 'vocal_gender', flag(flags, 'vocal'));

  const out = flag(flags, 'out') ?? (flags['auto-out'] ? defaultOutPath('audio', 'mp3') : undefined);
  await checkInput('ai-music-api/generate', input, flags.strict === true, true);
  const taskId = await createTask('ai-music-api/generate', input, flag(flags, 'callback'));
  await finishTask(taskId, { timeoutMs: parseTimeoutSeconds(flag(flags, 'timeout'), 30 * 60_000), outPath: out });
}

async function mapAll<T>(items: string[], fn: (item: string) => Promise<T>): Promise<T[]> {
  return Promise.all(items.map(fn));
}

function titleFrom(text: string): string {
  return text.trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 80) || 'Untitled';
}

function putIf(target: Record<string, unknown>, key: string, value: string | undefined): void {
  if (value !== undefined) target[key] = value;
}
