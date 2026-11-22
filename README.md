# @maigo999/kie-cli

[![npm](https://img.shields.io/npm/v/@maigo999/kie-cli)](https://www.npmjs.com/package/@maigo999/kie-cli)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

CLI for [kie.ai](https://kie.ai) — one API key for 200+ image, video, music and chat models
(Nano Banana, Veo, Seedance, Suno, GPT, Claude, ...). Zero runtime dependencies, runs on
Node 18+ and Bun, and ships an [Agent Skills](https://agentskills.io/specification) skill
for coding agents ([skills.sh page](https://www.skills.sh/ozekimasaki/kie-cli/kie-cli)).

## Install & quickstart

```bash
npm install -g @maigo999/kie-cli   # or: bun add -g @maigo999/kie-cli

kie config set-key                 # paste your key from https://kie.ai/api-key (hidden prompt)
kie balance                        # verify credits
kie image gen "a white ceramic mug, product photo" --aspect 1:1 --out mug.png
kie video gen @story.md --aspect 16:9 --auto-out
kie music gen "relaxing lo-fi piano" --instrumental --out song.mp3
```

## Setup from source

Runs on **Bun** (no build step needed) or **Node 18+**.

```bash
# Bun
bun install
bun src/index.ts <command>      # direct TS execution
bun install -g .                # installs `kie` as a global command

# Node
npm install && npm run build
node dist/index.js <command>    # or npm link for `kie`
```

Register your API key once (saved to `~/.kie/config.json`, mode 0600):

```bash
kie config set-key              # hidden interactive prompt
kie config set-key <key>        # or inline; kie config show / clear
kie balance                     # create a key at https://kie.ai/api-key
```

Key resolution order: `--api-key` > `KIE_API_KEY` > saved config.

## Commands

| Requirement | Command |
| --- | --- |
| Model list | `kie models [--task image] [--provider Google] [--q veo] [--json]` |
| Credit balance | `kie balance` |
| Image generation | `kie image gen "a white ceramic mug, product photo" --aspect 1:1 --auto-out` |
| Image editing | `kie image edit "make it sunset" --image photo.jpg --out edited.png` |
| Reference-based generation | `kie image ref "same character reading a book" --ref chara.png --out scene.png` |
| Video generation | `kie video gen "waves on a beach at sunset" --aspect 16:9 --duration 5 --auto-out` |
| Music generation | `kie music gen "relaxing lo-fi piano" --style "Lo-fi Hip Hop" --auto-out` |
| LLM chat | `kie chat --model gpt-5.2 "hello"` (or `kie chat --model ...` for a streaming REPL) |

Extra pass-through commands for any market model:

```bash
kie run google/nano-banana --prompt "..."        # submit + wait
kie run <model> --input '{"prompt":"..."}' --no-wait
kie status <taskId> [--wait] [--out file]        # query / resume a task
kie upload ./local.png                           # local file -> hosted URL (auto-used by --image/--ref)
```

## Prompts from files & reference images

Any prompt accepts the `@file` prefix (markdown/text is sent verbatim), and `--image/--ref`
accept local files or URLs — local files are uploaded automatically (upload links live 24 h):

```bash
kie image gen @prompt.md                        # prompt from a markdown file
kie image ref "same character reading a book" --ref chara.png --ref style.png --out scene.png
kie image edit "make it sunset" --image photo.jpg --out edited.png
kie chat --model gpt-5.2 @question.txt --system @persona.md
kie run <model> --input @params.json            # raw JSON parameters from a file too
```

## Notes

- Generation is async: the CLI polls `recordInfo` until `success`/`fail` (defaults: 10 min image, 30 min video/music; override with `--timeout <seconds>`). Without `--out`, result URLs are printed instead of downloading.
- Chat uses the OpenAI-compatible endpoint `https://api.kie.ai/openai/v1/chat/completions`; list models with `kie chat models [--protocol anthropic]`.
- Default models: `google/nano-banana` (gen), `nano-banana-2-1` (ref), `google/nano-banana-edit` (edit), `bytedance/seedance-2-5` (video), `ai-music-api/generate` + Suno `V6` (music). Override with `--model` / `--input` JSON.
- Generated files are kept by KIE for 14 days; use `--auto-out` or `--out` to save locally.

## Agent skill

[`skills/kie-cli/SKILL.md`](skills/kie-cli/SKILL.md) follows the [Agent Skills spec](https://agentskills.io/specification) (`skills/<name>/SKILL.md`), so it installs with the open tooling:

```bash
npx skills add ozekimasaki/kie-cli                 # skills.sh CLI (Claude Code, Cursor, Codex, ... )
gh skill install ozekimasaki/kie-cli kie-cli       # GitHub CLI (Copilot, Qoder, ...); --scope user to install globally
cp -r skills/kie-cli ~/.qoder/skills/              # Qoder, manually
```

## Links

- API docs: https://docs.kie.ai
- npm: https://www.npmjs.com/package/@maigo999/kie-cli
- Skill listing: https://www.skills.sh/ozekimasaki/kie-cli/kie-cli
- Keys & billing: https://kie.ai/api-key
