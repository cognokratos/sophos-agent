# Using the Memory MCP

This document demonstrates how to use the Memory MCP tool with the agent.

## Overview

The Memory MCP provides simple read and write capabilities for storing and retrieving short-term memory items. It's useful for the agent to remember information during a conversation.

## Example Usage

To demonstrate the Memory MCP tool, you can ask the agent to:

### Write to Memory

```
Remember that my favorite color is blue.
```

The agent will use the `create_entities` tool to store this information.

### Read from Memory

```
What is my favorite color?
```

The agent will use the `search_nodes` tool to retrieve previously stored information.

## Expected Tool Calls

When using the Memory MCP, you should see these tool calls in the reasoning trace:

- `create_entities` - When storing information
- `search_nodes` - When retrieving information

## Integration Details

The Memory MCP is configured as an MCP server in the `config/mcp.json` file and integrated via the `@langchain/mcp-adapters` client. The agent automatically retrieves available tools from connected MCP servers during initialization.
