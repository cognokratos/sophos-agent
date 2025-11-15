# Using the Fetch MCP

This document demonstrates how to use the Fetch MCP tool with the agent.

## Overview

The Fetch MCP provides safe HTTP GET request capabilities for fetching content from URLs. It's useful for the agent to retrieve external information.

## Example Usage

To demonstrate the Fetch MCP tool, you can ask the agent to:

### Fetch Content from a URL

```
Get the content from https://httpbin.org/get
```

The agent will use the `fetch.get` tool to retrieve the content from the specified URL.

### Fetch and Summarize a Webpage

```
Fetch the content from https://jsonplaceholder.typicode.com/posts/1 and tell me what it contains.
```

The agent will use the `fetch.get` tool to retrieve the content and then process it.

## Expected Tool Calls

When using the Fetch MCP, you should see this tool call in the reasoning trace:

- `fetch.get` - When performing an HTTP GET request

## Safety Considerations

- The Fetch MCP only supports HTTP GET requests
- URLs are checked for safety before execution
- The agent cannot access localhost or private network addresses by default

## Integration Details

The Fetch MCP is configured as an MCP server in the `config/mcp.json` file and integrated via the `@langchain/mcp-adapters` client. The agent automatically retrieves available tools from connected MCP servers during initialization.