import { apiKey, clearApiKey, CONFIG_PATH, isApiKeyAvailable, saveApiKey } from '../client.js';
import type { ParsedArgs } from '../cli.js';

export async function configCommand(sub: string | undefined, { positional }: ParsedArgs): Promise<void> {
  switch (sub) {
    case 'set-key': {
      const key = positional[0] ?? (await promptHidden());
      if (!key) throw new Error('Empty key, nothing saved.');
      saveApiKey(key);
      console.log(`API key saved to ${CONFIG_PATH}`);
      return;
    }
    case 'show': {
      console.log(`config file: ${CONFIG_PATH} (${isApiKeyAvailable() ? 'key configured' : 'no key configured'})`);
      if (isApiKeyAvailable()) console.log(`key: ${mask(apiKey())}`);
      return;
    }
    case 'clear':
      console.log(clearApiKey() ? `Removed key from ${CONFIG_PATH}` : 'No stored key to remove.');
      return;
    default:
      throw new Error('Usage: kie config <set-key [key]|show|clear>');
  }
}

function mask(key: string): string {
  return key.length <= 8 ? '****' : `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function promptHidden(): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new Error('Usage: kie config set-key <key> (or run interactively to enter it hidden)');
  }
  process.stdout.write('Enter kie.ai API key (hidden): ');
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    let value = '';
    const finish = (result: string): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stdout.write('\n');
      resolve(result);
    };
    const onData = (chunk: Buffer): void => {
      for (const ch of chunk.toString('utf8')) {
        const code = ch.charCodeAt(0);
        if (code === 3) return finish('');
        if (code === 13 || code === 10) return finish(value.trim());
        if (code === 127 || code === 8) value = value.slice(0, -1);
        else if (code >= 32) value += ch;
      }
    };
    stdin.on('data', onData);
  });
}
