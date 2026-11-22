#!/usr/bin/env node
import { createRequire } from 'node:module';
import { parseArgs, HELP } from './cli.js';
import { balanceCommand, modelsCommand, runCommand, statusCommand, uploadCommand } from './commands/info.js';
import { imageCommand, musicCommand, videoCommand } from './commands/generate.js';
import { chatCommand } from './commands/chat.js';
import { configCommand } from './commands/config.js';
import { setApiKey } from './client.js';

async function main(): Promise<void> {
  const { positional, flags, repeats } = parseArgs(process.argv.slice(2));

  if (typeof flags['api-key'] === 'string') setApiKey(flags['api-key']);

  if (flags.help === true || positional[0] === 'help') {
    console.log(HELP(positional[1] ?? ''));
    return;
  }
  if (flags.version === true || positional[0] === 'version') {
    const { version } = createRequire(import.meta.url)('../package.json') as { version: string };
    console.log(`kie-cli ${version}`);
    return;
  }
  const [command, ...rest] = positional;
  if (!command) {
    console.log(HELP());
    return;
  }
  const [sub, ...args] = rest;

  switch (command) {
    case 'models':
      return modelsCommand({ positional: rest, flags, repeats });
    case 'balance':
    case 'credits':
      return balanceCommand({ positional: rest, flags, repeats });
    case 'image':
      return imageCommand(sub, { positional: args, flags, repeats });
    case 'video':
      return videoCommand(sub, { positional: args, flags, repeats });
    case 'music':
      return musicCommand(sub, { positional: args, flags, repeats });
    case 'chat':
      if (sub === 'models') return chatCommand('models', { positional: args, flags, repeats });
      return chatCommand(undefined, { positional: rest, flags, repeats });
    case 'run':
      return runCommand({ positional: rest, flags, repeats });
    case 'status':
      return statusCommand({ positional: rest, flags, repeats });
    case 'upload':
      return uploadCommand({ positional: rest, flags, repeats });
    case 'config':
      return configCommand(sub, { positional: args, flags, repeats });
    default:
      console.error(`Unknown command: ${command}\n`);
      console.log(HELP());
      process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(`kie: ${(error as Error).message ?? String(error)}`);
  process.exitCode = 1;
});
