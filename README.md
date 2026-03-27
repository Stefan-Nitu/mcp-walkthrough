[![NPM Version](https://img.shields.io/npm/v/mcp-walkthrough)](https://www.npmjs.com/package/mcp-walkthrough)
[![NPM Downloads](https://img.shields.io/npm/dm/mcp-walkthrough)](https://www.npmjs.com/package/mcp-walkthrough)
[![CI Status](https://github.com/Stefan-Nitu/mcp-walkthrough/actions/workflows/ci.yml/badge.svg)](https://github.com/Stefan-Nitu/mcp-walkthrough/actions/workflows/ci.yml)
[![MIT Licensed](https://img.shields.io/npm/l/mcp-walkthrough)](https://github.com/Stefan-Nitu/mcp-walkthrough/blob/main/LICENSE)

# MCP Walkthrough

An MCP server for interactive code walkthroughs. Claude drives the narrative — opens files, highlights code, shows inline explanations, and navigates step by step.

## Overview

Text in a terminal isn't enough when you want Claude to explain a solution. MCP Walkthrough lets Claude open files in VS Code, highlight specific lines, and show rich markdown explanations right next to the code. Navigate at your own pace — forward, back, or let it autoplay.

**Key Features:**
- **Inline Explanations** — Markdown comment bubbles appear right next to highlighted code
- **Multi-Step Walkthroughs** — Claude sends all steps at once, you navigate with keyboard shortcuts
- **Autoplay** — Optional auto-advance with reading-speed-based timing
- **Keyboard Navigation** — `Cmd+Shift+Right` / `Cmd+Shift+Left` to navigate steps
- **Selection Reading** — Claude can see what you've highlighted to discuss it further
- **Focus Preservation** — Opens files without stealing focus from your terminal

> **Note:** This MCP server requires VS Code. It includes a companion VS Code extension that is automatically installed on first run.

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

You have access to walkthrough tools via MCP. Use them to visually walk the user through code — open files, highlight lines, and show inline explanations in VS Code.
```

## Available Tools

| Tool | Description |
|------|-------------|
| **show_code** | Open a file and highlight specific lines |
| **explain_code** | Highlight lines + show an inline markdown explanation bubble |
| **clear_explanations** | Remove all explanation bubbles |
| **walkthrough** | Start a multi-step walkthrough with all steps at once |
| **walkthrough_navigate** | Navigate an active walkthrough (next/prev/goto) |
| **walkthrough_status** | Get current walkthrough state |
| **get_selection** | Read the currently highlighted code in VS Code |

### walkthrough

The main tool. Claude generates all steps and sends them at once. The VS Code extension handles navigation.

```json
{
  "steps": [
    {
      "file": "/absolute/path/to/file.ts",
      "line": 10,
      "endLine": 25,
      "explanation": "## Auth Middleware\n\nThis validates the JWT token on every request.",
      "title": "Token Validation"
    }
  ],
  "autoplay": false,
  "delayMs": 5000
}
```

**Parameters:**
- `steps` — Array of `{ file, line, endLine?, explanation, title? }`
- `autoplay` — Auto-advance through steps (default: `false`)
- `delayMs` — Delay between steps in ms when autoplay is on (default: calculated from reading speed)

### walkthrough_navigate

```json
{ "action": "next" }
{ "action": "prev" }
{ "action": "goto", "step": 3 }
```

### Keyboard Shortcuts

During an active walkthrough:
- **Cmd+Shift+Right** — Next step
- **Cmd+Shift+Left** — Previous step
- **Status bar** — Shows current step, click to stop

## How It Works

```
Claude Code  →  MCP Server (stdio)  →  HTTP localhost:7890  →  VS Code Extension  →  Editor API
```

1. Claude calls walkthrough tools via MCP
2. The MCP server forwards requests to a companion VS Code extension over HTTP
3. The extension uses the VS Code API to open files, select ranges, and create comment threads
4. Focus stays in your terminal — code appears in the editor beside it

The VS Code extension is bundled with the npm package and automatically installed on first run.

## Development

### Project Structure

```
mcp-walkthrough/
├── src/
│   ├── index.ts              # MCP server entry point, tool registration
│   ├── bridge.ts             # HTTP client to VS Code extension
│   └── utils/
│       └── logger.ts         # Pino logger (stderr only)
├── vscode-extension/
│   ├── src/
│   │   └── extension.ts      # VS Code extension (HTTP server, Comments API)
│   └── package.json
├── tests/
│   └── bridge.test.ts
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

### Tools return "This MCP server only works from VS Code."

The MCP server pings the VS Code extension on startup. If the extension isn't running:

1. Make sure you're running Claude Code inside VS Code (not a standalone terminal)
2. The extension activates on VS Code startup — try reloading the window (`Cmd+Shift+P` → "Reload Window")

### Extension not installed

The MCP server auto-installs the extension on first run via `code --install-extension`. If this fails:

1. Verify the `code` CLI is available in your terminal
2. Manually install: `code --install-extension path/to/walkthrough-bridge.vsix`

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
