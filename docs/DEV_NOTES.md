# Walkthrough — Dev Notes

## Local Dev Setup

### MCP server (npm global)

Powers the `mcp-walkthrough` MCP tools in Claude Code.

```bash
npm run build && npm install -g .
```

Then restart MCP server via `/mcp` → reconnect mcp-walkthrough.

### VS Code extension (walkthrough-bridge)

Creates the `walkthrough-bridge-<hash>.sock` that the MCP server connects to.

```bash
cd vscode-extension
npx tsc -p ./ && npx @vscode/vsce package --allow-missing-repository -o walkthrough-bridge.vsix
code --install-extension walkthrough-bridge.vsix --force
```

Then **restart VS Code** (not just reload — extension code is cached until full restart).

### Cockpit integration

When used inside the cockpit monorepo, cockpit imports walkthrough's VS Code modules via adapter. Cockpit's extension owns the socket (`cockpit-bridge-<hash>.sock`). The standalone walkthrough-bridge extension is not needed in that mode.

Both extensions register `walkthrough.next/prev/stop` commands — they conflict if both are active. Disable one to test the other.

## msedge-tts pnpm Enforcement

`msedge-tts` has `"preinstall": "npx only-allow pnpm"` which fails with bun. Fixed via `bun patch` — see `patches/msedge-tts@2.0.4.patch`.

## Edge TTS Initialization

Edge TTS connects to Microsoft's servers on first use. The `getEdgeTts()` function lazily initializes the client. If the network is down, TTS falls back to native platform speech (`speakNative`).
