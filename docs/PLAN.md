# Walkthrough — Plan

## Vision

Claude-driven interactive code walkthroughs. Opens files, highlights code, shows inline explanations, narrates with TTS. Works standalone via npm or embedded in cockpit.

## Current Status

**v0.3.1** — Coordinator/shell architecture. Pure state machine yields `WalkthroughState` via `AsyncIterable`. Shell subscribes and renders. Selection clears after narration. Navigation works correctly with single-step narration and shell-driven autoplay.

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

### ~~Sub-range highlighting during narration~~ (done)
- Teleprompter bubble: text builds up as TTS narrates each highlight, current section bold
- Selection moves through code sub-ranges in sync with narration

### ~~Move TTS into VS Code extension~~ (done)
- TTS lives in extension, keybindings trigger narration, MCP server is thin passthrough

### Step restart
- `Cmd+Shift+↑` restarts current step from the beginning (re-narrate explanation + highlights)
- Useful when you missed something or want to re-listen

### Walkthrough skill for Claude Code
- A skill that constructs walkthroughs with correct line numbers
- Reads the target files, understands the code structure
- Spawns a subagent to plan steps + highlights with verified line ranges
- Main agent just triggers the skill, e.g. `/walkthrough src/tts.ts`
- Eliminates line number guessing — the skill reads the file first

### Walkthrough export/import
- Save walkthroughs to JSON files so they can be replayed later
- Export: save current walkthrough steps + highlights to `.walkthrough.json`
- Import: load a `.walkthrough.json` and start the walkthrough
- Enables sharing walkthroughs between team members
- Agent can generate a walkthrough once, user replays it anytime

### Distribution and installation
- One-command install for all clients: `npx add-mcp mcp-walkthrough -- npx -y mcp-walkthrough`
- Auto-detects Claude Code, Cursor, VS Code, Codex, Windsurf — writes config for each
- Skill ships with the package (`.claude/skills/mcp-walkthrough/`)
- Update README with one-liner install + skill setup

### ~~Extract modular core~~ (done)
- Split into `editor.ts`, `explanations.ts`, `walkthrough.ts`
- `extension.ts` is thin wiring
- Cockpit imports via adapter with constructor injection

### Extract use cases from coordinator (Phase 2)
The coordinator (`walkthrough-coordinator.ts`) is a working blob. Seams to extract:
- **narrateStep** — the show → highlight → idle flow. Currently inline in `runNarration`. Pure, no vscode deps. Yields `WalkthroughState` frames.
- **validateSteps** — highlight range validation. Already a separate function, could move to its own module.
- **stripMarkdown** — TTS text prep. Already exported, used by both coordinator and MCP server's `tts.ts`.
- **buildTeleprompterText / buildFinalText** — bubble text formatting. Pure functions, duplicated from old `teleprompter.ts`.
- **channel** — async push/consume channel. Generic utility, could be reused.

Per architecture principles: extract when a second consumer appears. Currently each has one consumer. Monitor for duplication.

### Add shell autoplay + navigation tests
Autoplay (shell calls `navigate("next")` on idle) and manual navigation suppression (`manualNav` flag) are untested. The logic lives in the shell which has vscode deps. Options:
- Extract autoplay decision into coordinator (testable)
- Create a shell adapter that's testable without vscode
- Integration test via MCP inspector

### Debug logging cleanup
- Currently using `log.info` for all logs because VS Code `LogOutputChannel` debug level filtering doesn't work as expected
- Should be `log.debug` for state transitions, `log.info` for start/stop/navigate
- Investigate VS Code log level configuration
