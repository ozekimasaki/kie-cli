# Built-in model parameter notes

Verified from docs.kie.ai OpenAPI pages (kie-cli 0.2.x). Treat `kie schema <model>` as the
live source of truth — kie.ai edits these pages. kie **silently ignores unknown input keys**:
a typo or a made-up parameter (e.g. pixel `size`) does not error, it just falls back to defaults;
the CLI prints a `[kie] warning: schema check ...` line when this happens (`--strict` to fail).

## google/nano-banana — default for `kie image gen`

| Field | Values |
| --- | --- |
| `prompt` | required, max 20 000 chars |
| `aspect_ratio` | `1:1 9:16 16:9 3:4 4:3 3:2 2:3 5:4 4:5 21:9 auto` (11 enum values — no arbitrary ratios, no pixel sizes) |
| `output_format` | `png jpeg` |
| `image_size` | deprecated alias of `aspect_ratio` |
| `nsfw_checker` | boolean (`--nsfw-checker`) |

No image input on this model — use `kie image ref`/`edit` for references. Custom ratios
(e.g. business card 91:55): generate at the nearest enum value, crop locally.

## nano-banana-2-1 — default for `kie image ref`

Docs slug is `google/nanobanana-2-1` (no hyphens); the CLI resolves it.

| Field | Values |
| --- | --- |
| `prompt` | required, max 20 000 chars |
| `image_input` | array of uploaded-file URLs, **max 10**, jpeg/png/webp ≤ 30 MB each |
| `aspect_ratio` | `1:1 2:3 3:2 1:4 4:1 3:4 4:3 4:5 5:4 1:8 8:1 9:16 16:9 21:9 auto` (15 values, incl. ultra-wide 1:4/1:8) |
| `resolution` | `1K 2K 4K` |
| `output_format` | `png jpg` (note: `jpg`, not `jpeg` as on nano-banana) |

Reference images use the `image_input` key (the CLI handles this); other models use `image_urls`.

## google/nano-banana-edit — default for `kie image edit`

| Field | Values |
| --- | --- |
| `prompt` | required, max 20 000 chars |
| `image_urls` | required, array, max 10, jpeg/png/webp ≤ 10 MB |
| `aspect_ratio` / `image_size`(deprecated) | same 11-value enum as nano-banana |
| `output_format` | `png jpeg` |

## bytedance/seedance-2-5 — default for `kie video gen`

| Field | Values |
| --- | --- |
| `prompt` | max 20 480 chars (optional when reference media given) |
| `first_frame_url` / `last_frame_url` | image URL or `asset://<id>` |
| `reference_image_urls` / `reference_video_urls` / `reference_audio_urls` | arrays (`--ref-image/--ref-video/--ref-audio`) |
| `omni_reference_task_type` | `auto reference edit extend` |
| `aspect_ratio` | `1:1 4:3 3:4 16:9 9:16 21:9 adaptive` |
| `resolution` | `480p 720p 1080p 4k` |
| `duration` | integer 4–30 s; `-1` = automatic |
| `output_format` | `mp4 mov` |
| `generate_audio` | boolean, default true (`--audio` / `--no-audio`) |
| `return_last_frame`, `web_search`, `nsfw_checker` | booleans; `draft: true` restricts to 480p |

## ai-music-api/generate — Suno, default for `kie music gen`

Docs live at `https://docs.kie.ai/suno-api/generate-music.md` (outside `/market/`).

| Field | Values |
| --- | --- |
| `model` | required, `V4 V4_5 V4_5PLUS V4_5ALL V5 V5_5 V6 V6_MINI V6_WILD` (CLI `--version`, default V6) |
| `custom_mode` | required; `true` = lyrics in `prompt` (CLI sets it automatically with `--lyrics`) |
| `instrumental` | required boolean (`--instrumental`) |
| `prompt` | style description (simple mode) or lyrics with `[Verse]/[Chorus]` tags (custom mode) |
| `title` | required in custom mode (CLI derives it from the description when omitted) |
| `style` | only meaningful in custom mode |
| `negative_tags` | exclusion string |
| `vocal_gender` | `m f` — **not** `male/female` |
| `style_weight` / `weirdness_constraint` / `audio_weight` | 0–1 numbers, custom mode only (pass via `--input`) |

Two tracks come back per task; `--out` files get `-1/-2` suffixes.

## Chat models (`kie chat`)

Not market-task models — OpenAI-compatible endpoint; `kie chat models [--protocol anthropic]`
lists ids (`gpt-5.2`, `claude-*`, `gemini-*`, …). No schema check applies; unknown `--model`
fails at request time.
