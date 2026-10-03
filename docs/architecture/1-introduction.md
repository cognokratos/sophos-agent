# 1) Introduction

This document describes the full-stack architecture of **Σοφός Agent**, an open-source, **local-first “AI Systems Classroom in a Box.”** Learners explore agent orchestration (**LangGraph.js**), on-device inference (**Ollama**), tool use through the **Model Context Protocol (MCP)**, and inspectable persistence (**Markdown + JSONL**), run locally with **Docker Compose** or `pnpm dev`.

**Local inference and local state by default, with explicit network access through configured tools.** The model runs in Ollama on your machine and conversations and memory are plain files under `data/`. The one component that reaches the internet is the Fetch MCP server, and only because it is listed in `mcp.json`.

The documents describe the system **as implemented**. Planned work is collected in [11) Roadmap](./11-roadmap-from-prd.md) and labelled as such wherever it is mentioned.

## Starter Template or Existing Project

**Decision:** N/A — **Greenfield project.** The original document set was generated with BMAD Team Fullstack’s `fullstack-architecture` workflow; it is now maintained by hand against the code.

---
