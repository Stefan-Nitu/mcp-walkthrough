# Walkthrough — Plan

## Vision

Claude-driven interactive code walkthroughs. Opens files, highlights code, shows inline explanations, narrates with TTS. Works standalone via npm or embedded in cockpit.

## Current Status

**v0.2.5** — MCP server with TTS, VS Code bridge extension, published on npm.

## Bugs

- [x] **TTS reads literal `\n\n` aloud** — fixed, `stripMarkdown` converts escaped newlines and all newlines to spaces
- [x] **Walkthrough state dies between MCP tool calls** — fixed, narration loop exits when voice is off instead of racing through all steps
- [x] **TTS plays without bridge connection** — fixed, checks bridge result before starting narration
- [x] **`explain_code` doesn't highlight lines** — fixed, explanations don't refocus terminal so selection stays visible
- [x] **Auto-advance delay not configurable** — fixed, `autoplay` and `autoplayDelay` added to persisted config
- [x] **Unguarded `JSON.parse` in socket handler** — fixed with try/catch + 400 response
- [x] **Trusted markdown renders LLM command URIs** — fixed, sanitization in `explanations.ts`
- [x] **PowerShell metacharacter injection in TTS** — fixed, uses EncodedCommand
- [x] **VS Code engine mismatch** — both now at `^1.100.0`

## Next

### Autoplay
- Add `autoplay` and `autoplayDelay` to persisted config
- `autoplay: true` = auto-advance + auto-navigate. Manual next/prev still work as overrides (cancel current TTS, jump immediately).
- `autoplay: false` = manual next/prev only. TTS still plays per step if voice is on.
- Step wait time when autoplay is on: `max(tts_duration, reading_time) + autoplayDelay`
  - `tts_duration` — actual time TTS takes to finish
  - `reading_time` — estimated visual reading time (word count, code block complexity)
  - `autoplayDelay` — user-configured additive linger time (default 0)
- Different strategies for reading_time — TBD

### ~~Extract modular core~~ (done)
- Split into `editor.ts`, `explanations.ts`, `walkthrough.ts`
- `extension.ts` is thin wiring
- Cockpit imports via adapter with constructor injection
