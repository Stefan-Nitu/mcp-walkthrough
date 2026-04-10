# Walkthrough — Plan

## Vision

Claude-driven interactive code walkthroughs. Opens files, highlights code, shows inline explanations, narrates with TTS. Works standalone via npm or embedded in cockpit.

## Current Status

**v0.2.5** — MCP server with TTS, VS Code bridge extension, published on npm.

## Bugs

- [ ] **TTS reads literal `\n\n` aloud** — `stripMarkdown` doesn't convert escaped newlines to pauses before passing to speech engine
- [ ] **Walkthrough state dies between MCP tool calls** — starts with `active: true` but next control command finds no walkthrough active
- [ ] **TTS plays without bridge connection** — narration continues even when VS Code bridge is down, no warning shown
- [ ] **`explain_code` doesn't highlight lines** — explanation bubble shows but the code range isn't selected/scrolled to
- [ ] **Auto-advance delay not configurable** — needs a user-facing setting, not just on/off
- [ ] **Unguarded `JSON.parse` in socket handler** — malformed JSON crashes the extension (`vscode-extension/src/extension.ts:81`)
- [ ] **Trusted markdown renders LLM command URIs** — `isTrusted = true` without sanitization in walkthrough's own extension (cockpit's handler fixes this, walkthrough's doesn't)
- [ ] **PowerShell metacharacter injection in TTS** — Windows spawn uses shell string instead of array-based spawn (`src/tts.ts:94`)
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

### Extract `core.ts`
- Pull VS Code logic (comments, file nav, walkthrough playback) out of `vscode-extension/src/extension.ts` into a reusable module
- `extension.ts` becomes thin: imports core, creates socket, wires them together
- Cockpit imports core via adapter instead of reimplementing
