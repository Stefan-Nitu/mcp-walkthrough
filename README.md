[![NPM Version](https://img.shields.io/npm/v/mcp-walkthrough)](https://www.npmjs.com/package/mcp-walkthrough)
[![NPM Downloads](https://img.shields.io/npm/dm/mcp-walkthrough)](https://www.npmjs.com/package/mcp-walkthrough)
[![CI Status](https://github.com/Stefan-Nitu/mcp-walkthrough/actions/workflows/ci.yml/badge.svg)](https://github.com/Stefan-Nitu/mcp-walkthrough/actions/workflows/ci.yml)
[![MIT Licensed](https://img.shields.io/npm/l/mcp-walkthrough)](https://github.com/Stefan-Nitu/mcp-walkthrough/blob/main/LICENSE)

# MCP Walkthrough

An MCP server for interactive code walkthroughs with voice narration. Claude drives the narrative — opens files, highlights code, explains inline, and reads each step aloud using neural text-to-speech.

## Overview

Text in a terminal isn't enough when you want Claude to explain a solution. MCP Walkthrough lets Claude open files in VS Code, highlight specific lines, show rich markdown explanations, and **narrate each step with a natural-sounding voice**. Navigate at your own pace — forward, back, pause, or let the voice guide you.

**Key Features:**
- **Voice Narration** — Neural text-to-speech reads each step aloud (400+ voices via Microsoft Edge TTS)
- **Inline Explanations** — Markdown comment bubbles appear right next to highlighted code
- **Multi-Step Walkthroughs** — Claude sends all steps at once, voice auto-advances through them
- **Live Controls** — Pause, resume, skip, stop, toggle voice/bubbles on the fly
- **Voice Selection** — Choose your narrator, audition voices, preference persisted across sessions
- **Keyboard Navigation** — `Cmd+Shift+Right` / `Cmd+Shift+Left` to navigate steps
- **Selection Reading** — Claude can see what you've highlighted to discuss it further
- **Focus Preservation** — Opens files without stealing focus from your terminal
- **Offline Fallback** — Falls back to native TTS (`say`/`espeak`) when offline

> **Note:** This MCP server requires VS Code, VS Code Insiders, or Cursor. It includes a companion VS Code extension that is automatically installed when you `npm install`. The CLI is auto-discovered even if `code` is not in your PATH.

## Installation

### Via npm (Recommended)

```bash
npm install -g mcp-walkthrough
```

### From Source

```bash
git clone https://github.com/Stefan-Nitu/mcp-walkthrough.git
cd mcp-walkthrough
bun install
bun run build
```

> Requires Bun v1.3.8+ (development) and Node.js v18+ (runtime)

## Quick Start

### With Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "mcp-walkthrough": {
      "command": "npx",
      "args": ["-y", "mcp-walkthrough"]
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "mcp-walkthrough": {
      "command": "mcp-walkthrough"
    }
  }
}
```

Restart Claude Code to pick up the new server.

### Add a CLAUDE.md hint

MCP tools are deferred (loaded on-demand), so Claude may not use them automatically. Add this to your project's `CLAUDE.md`:

```markdown
## Walkthrough MCP

You have access to walkthrough tools via MCP. Use them to visually walk the user through code with voice narration — open files, highlight lines, show inline explanations, and read each step aloud in VS Code.
```

## Available Tools

| Tool | Description |
|------|-------------|
| **walkthrough** | Start a voiced, multi-step code walkthrough |
| **walkthrough_control** | Pause, resume, next, prev, stop, toggle voice/bubbles |
| **walkthrough_voice** | Change narrator voice, audition voices, list available |
| **walkthrough_status** | Get current walkthrough state |
| **show_code** | Open a file and highlight specific lines |
| **explain_code** | Highlight lines + show explanation bubble (+ voice if enabled) |
| **clear_explanations** | Remove all explanation bubbles |
| **get_selection** | Read the currently highlighted code in VS Code |

### walkthrough

The main tool. Claude generates all steps and sends them at once. Voice narration and explanation bubbles are on by default. Returns immediately — narration runs in the background.

```json
{
  "steps": [
    {
      "file": "/absolute/path/to/file.ts",
      "line": 10,
      "endLine": 25,
      "explanation": "This validates the JWT token on every request. The secret is loaded from environment variables.",
      "title": "Token Validation"
    }
  ],
  "voice": true,
  "showBubbles": true
}
```

**Parameters:**
- `steps` — Array of `{ file, line, endLine?, explanation, title? }`
- `voice` — Enable voice narration (default: `true`)
- `showBubbles` — Show inline explanation bubbles (default: `true`)

Write explanations as **natural spoken language** — markdown is stripped before narration.

### walkthrough_control

Control an active walkthrough on the fly:

```json
{ "action": "next" }
{ "action": "prev" }
{ "action": "pause" }
{ "action": "resume" }
{ "action": "stop" }
{ "voice": false }
{ "showBubbles": false }
```

### walkthrough_voice

Change the narrator voice. Speaks a sample so you hear the difference. Persisted across sessions.

```json
{ "voice": "en-US-GuyNeural" }
{ "list": true, "locale": "en-US" }
{ "audition": true, "locale": "en-US", "gender": "Female" }
```

Popular voices: `en-US-AriaNeural`, `en-US-MichelleNeural`, `en-US-AndrewNeural`, `en-US-GuyNeural`

### Keyboard Shortcuts

During an active walkthrough (shown in the explanation bubble):
- **Cmd+Shift+Right** (macOS) / **Ctrl+Shift+Right** (Linux/Windows) — Next step
- **Cmd+Shift+Left** (macOS) / **Ctrl+Shift+Left** (Linux/Windows) — Previous step
- **Status bar** — Shows current step, click to stop

### Writing Explanations

Explanations render as markdown in VS Code comment bubbles and are also narrated as speech. Tips:

- **Write as natural speech** — the voice reads it aloud, so avoid heavy markdown
- **Use actual newlines** for paragraphs, not `\n` escape sequences
- **Avoid `##` headers** — they render too large in the comment bubble. Use **bold** instead
- Inline code, code blocks, lists, and links all work in bubbles

## How It Works

```
Claude Code  →  MCP Server (stdio)  →  Unix socket  →  VS Code Extension  →  Editor API
```

1. Claude calls walkthrough tools via MCP
2. The MCP server discovers a workspace-specific Unix socket (`/tmp/walkthrough-bridge-<hash>.sock`)
3. The VS Code extension listens on a socket derived from the workspace folder path
4. Each VS Code window gets its own socket — multiple windows work independently
5. Focus stays in your terminal — code appears in the editor beside it

The VS Code extension is bundled with the npm package and automatically installed on `npm install` and on first server start. The CLI is auto-discovered across VS Code, VS Code Insiders, and Cursor on all platforms.

## Development

### Project Structure

```
mcp-walkthrough/
├── src/
│   ├── index.ts              # MCP server entry point, tool registration
│   ├── bridge.ts             # Unix socket client to VS Code extension
│   ├── code-cli.ts           # Cross-platform VS Code CLI discovery
│   ├── tts.ts                # Text-to-speech (Edge TTS + native fallback)
│   ├── socket.ts             # Socket path computation and discovery
│   └── utils/
│       └── logger.ts         # Pino logger (stderr only)
├── scripts/
│   └── postinstall.cjs       # Auto-installs extension on npm install
├── vscode-extension/
│   ├── src/
│   │   └── extension.ts      # VS Code extension (HTTP server, Comments API)
│   └── package.json
├── tests/
│   ├── bridge.test.ts
│   ├── code-cli.test.ts
│   ├── postinstall.test.ts
│   ├── socket.test.ts
│   └── tts.test.ts
└── docs/
```

### Testing

```bash
bun test              # Run all tests
bun test --watch      # Watch mode
bun run typecheck     # Type checking
bun run lint          # Linting
bun run check         # Full check (typecheck + lint)
```

### Building

```bash
bun run build         # Builds MCP server + VS Code extension
```

The build script syncs the version from root `package.json` into the extension before packaging.

## Troubleshooting

### Tools return "No walkthrough bridge socket found"

The MCP server discovers the VS Code extension via a Unix socket. If the socket isn't found:

1. Make sure you're running Claude Code inside VS Code (not a standalone terminal)
2. The extension activates on VS Code startup — try reloading the window (`Cmd+Shift+P` → "Reload Window")
3. The socket is workspace-specific — make sure the VS Code window has a folder open

### Extension not installed

The MCP server auto-discovers VS Code, VS Code Insiders, and Cursor CLIs — even when `code` isn't in your PATH. It searches:

- **macOS**: `/Applications/*.app/Contents/Resources/app/bin/`
- **Linux**: `/usr/bin/`, `/usr/local/bin/`, `/snap/bin/`, `/opt/*/bin/`
- **Windows**: `%LOCALAPPDATA%\Programs\*\bin\`

The extension is installed into **all** found editors. If auto-install still fails:

1. Manually install: `code --install-extension path/to/walkthrough-bridge.vsix`
2. Or reload the VS Code window after installing the npm package

## Contributing

1. Fork the repository
2. Create a feature branch
3. **Write tests first** (TDD approach)
4. Implement the feature
5. Ensure all tests pass (`bun test`)
6. Run linting (`bun run lint`)
7. Submit a pull request

## License

MIT

## Related Projects

- [Model Context Protocol](https://modelcontextprotocol.io) - MCP specification and documentation
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) - SDK used by this server
- [MCP Claude Code Conversation History](https://github.com/Stefan-Nitu/mcp-claude-code-conversation-history) - MCP server for searching Claude Code conversations
