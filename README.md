# @ozekimasaki/kie-cli

CLI for [kie.ai](https://kie.ai) — one API key for image, video, music and chat models.
Zero runtime dependencies (Node 18+/Bun, built on the official KIE APIs). Ships a
Qoder/Claude-style agent skill in [`skills/kie-cli/`](skills/kie-cli/SKILL.md).

## Install

```bash
npm install -g @ozekimasaki/kie-cli   # or: bun add -g @ozekimasaki/kie-cli
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

## Notes

- Local files passed to `--image/--ref/--lyrics` are uploaded via the KIE File Upload API first (uploaded files expire in 24 h).
- Generation is async: the CLI polls `recordInfo` until `success`/`fail` (defaults: 10 min image, 30 min video/music; override with `--timeout <seconds>`). Without `--out`, result URLs are printed instead of downloading.
- Chat uses the OpenAI-compatible endpoint `https://api.kie.ai/openai/v1/chat/completions`; list models with `kie chat models [--protocol anthropic]`.
- Default models: `google/nano-banana` (gen), `nano-banana-2-1` (ref), `google/nano-banana-edit` (edit), `bytedance/seedance-2-5` (video), `ai-music-api/generate` + Suno `V6` (music). Override with `--model` / `--input` JSON.
- Generated files are kept by KIE for 14 days; use `--auto-out` or `--out` to save locally.

## Agent skill

[`skills/kie-cli/SKILL.md`](skills/kie-cli/SKILL.md) teaches coding agents (Qoder, Claude Code, etc.) to drive this CLI. Install it with:

```bash
cp -r skills/kie-cli ~/.qoder/skills/    # or your agent's skills directory
```
