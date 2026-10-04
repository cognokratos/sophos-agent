# Using the Memory MCP

This document demonstrates how to use the Memory MCP tool with the agent.

## Overview

The Memory MCP stores a small knowledge graph (entities, relations, observations) in `data/memory/memory.jsonl`. It persists across conversations and restarts.

## Example Usage

To demonstrate the Memory MCP tool, you can ask the agent to:

### Write to Memory

```
Remember that my favorite color is blue.
```

The agent will use the `memory__create_entities` tool to store this information.

### Read from Memory

```
What is my favorite color?
```

The agent will use the `memory__search_nodes` tool to retrieve previously stored information.

## Expected Tool Calls

When using the Memory MCP, you should see these tool calls in the reasoning trace:

- `memory__create_entities` - When storing information
- `memory__search_nodes` (or `memory__read_graph`) - When retrieving information

Tool names are prefixed with the server name from `mcp.json` (`memory`).

## Integration Details

The Memory MCP is configured in `config/mcp.json` (stdio, `pnpm dev`) or `infra/app/config/mcp.json` (HTTP, Docker) and connected through a single `MCPAdapter` from `@langchain/mcp-adapters`. Tools are discovered on the first chat request.
