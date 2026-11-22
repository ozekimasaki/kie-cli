---
name: kie-cli
description: Generate and edit images, videos, and music, and chat with LLMs through kie.ai using the kie CLI (@ozekimasaki/kie-cli). Use when the user asks to 画像生成/動画生成/音楽生成/Suno/Veo/Nano Banana/Seedance/画像編集/リファレンスから生成/クレジット確認/モデル一覧 or to run, call, list or debug kie commands; failed tasks can be resumed with kie status.
---

# kie-cli

## Overview

Drive the kie.ai API (200+ image/video/music/chat models, one credit balance) through the `kie` CLI. All generation is async; the CLI submits, polls, prints result URLs, and downloads with `--out`.

## Locate the binary

Try in order; use the first that works:

1. `kie` if it is on PATH (`npm install -g @ozekimasaki/kie-cli` or `bun add -g @ozekimasaki/kie-cli`).
2. From a checkout of https://github.com/ozekimasaki/kie-cli , Bun with no build step: `bun <repo>/src/index.ts <command> ...`
3. Same checkout, Node on the build output: `node <repo>/dist/index.js <command> ...` (build first: `npm install && npm run build`).

## API key

Key resolution order: `--api-key` flag > `KIE_API_KEY` env > saved config (`~/.kie/config.json`).
If no key is configured, ask the user to run `kie config set-key` themselves (interactive hidden prompt; do not echo or store their key in files or chat), or to export `KIE_API_KEY`. Keys are created at https://kie.ai/api-key. Verify with `kie balance`.

## Commands

| Task | Command |
| --- | --- |
| Register key | `kie config set-key` (hidden prompt) / `kie config show` / `kie config clear` |
| Credits | `kie balance` |
| Model list | `kie models [--q keyword] [--provider Google] [--task image] [--json]` |
| Text→image | `kie image gen "prompt" --aspect 1:1 --out out.png` |
| Ref→image | `kie image ref "prompt" --ref a.png [--ref b.png] --out out.png` (up to 10 refs) |
| Edit image | `kie image edit "instruction" --image photo.jpg --out edited.png` |
| Video | `kie video gen "prompt" --duration 5 --aspect 16:9 --out clip.mp4` |
| Video from image | `kie video gen "prompt" --image first.jpg --out clip.mp4` |
| Music | `kie music gen "style description" --instrumental --out song.mp3` |
| Music w/ lyrics | `kie music gen --lyrics @lyrics.txt --title "Name" --out song.mp3` |
| Chat once | `kie chat --model gpt-5.2 "question" --no-stream` |
| Chat models | `kie chat models` |
| Any model | `kie run <model-id> --input '{"prompt":"..."}'` |
| Resume task | `kie status <taskId> --wait --out file` |

Always pass `--out <path>` (or `--auto-out`) when the user wants a saved file — result URLs expire in 14 days. Local file paths given to `--image/--ref/--lyrics` are uploaded automatically (upload links expire in 24 h; the CLI handles this per run).

## Defaults & overrides

- Models: gen `google/nano-banana`, ref `nano-banana-2-1`, edit `google/nano-banana-edit`, video `bytedance/seedance-2-5`, music Suno `V6` (`--version V6_MINI|V6_WILD`). Override with `--model` or merge raw fields via `--input '<json>'`.
- Video also accepts `--last-frame`, `--ref-image/--ref-video/--ref-audio`, `--audio|--no-audio`, `--resolution`.
- Timeouts: 10 min image, 30 min video/music; override with `--timeout <seconds>`. On timeout the task keeps running server-side — re-read the taskId from stderr and finish with `kie status <taskId> --wait`.
- `--json` on models/balance/status/chat for machine-readable output.

## Workflow hints

1. For an unfamiliar model, `kie models --q <name>` then `kie run <id> --input ...`; parameter docs: https://docs.kie.ai.
2. Check `kie balance` before expensive video/music batches (a 402 error means insufficient credits).
3. Errors come back as `kie: <message>` with exit 1 (usage errors exit 2). Common codes: 401 bad key, 402 no credits, 429 rate limit (≤20 submits/10 s) — back off and retry.
4. Report saved file paths back to the user; with multiple results (music tracks, image sets) files get `-1/-2` suffixes.
