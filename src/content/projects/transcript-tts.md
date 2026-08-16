---
title: transcript-tts
order: 0
repos:
  - name: transcript-tts
    github: ShevinuM/transcript-tts
    branch: main
---
# transcript-tts

Free MCP server that turns text and transcripts into MP3 audio using
Microsoft Edge's neural TTS voices — no API key, no account, no usage cap.

## Stack
- Python, served over the Model Context Protocol
- `edge-tts` for synthesis, `uv` for packaging
- drop-in `claude mcp add` / `claude_desktop_config.json` registration

## Status
shipped · used daily from Claude Code
