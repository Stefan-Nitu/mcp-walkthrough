---
name: mcp-walkthrough
description: "Interactive code walkthrough expert. ALWAYS invoke this skill when the user asks to explain code, understand a system, walk through code, or asks 'how does this work'. Do not explain code as text directly — use this skill first."
user-invocable: false
---

Load the walkthrough MCP tools before proceeding:

`ToolSearch("select:mcp__mcp-walkthrough__walkthrough,mcp__mcp-walkthrough__explain_code,mcp__mcp-walkthrough__settings,mcp__mcp-walkthrough__show_code,mcp__mcp-walkthrough__clear_explanations,mcp__mcp-walkthrough__get_selection")`

**CRITICAL: Read the target file first.** Never guess line numbers — verify them from the file content before building steps or highlights.
