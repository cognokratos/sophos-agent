# Using the Fetch MCP

This document demonstrates how to use the Fetch MCP tool with the agent.

## Overview

The Fetch MCP retrieves a URL and returns its content as Markdown. It is the system's explicit network access: requests go to whatever URL the model chooses.

## Example Usage

To demonstrate the Fetch MCP tool, you can ask the agent to:

### Fetch Content from a URL

```
Get the content from https://httpbin.org/get
```

The agent will use the `fetch__fetch` tool to retrieve the content from the specified URL.

### Fetch and Summarize a Webpage

```
Fetch the content from https://jsonplaceholder.typicode.com/posts/1 and tell me what it contains.
```

The agent will use the `fetch__fetch` tool to retrieve the content and then process it.

## Expected Tool Calls

When using the Fetch MCP, you should see this tool call in the reasoning trace:

- `fetch__fetch` - When performing an HTTP GET request

Tool names are prefixed with the server name from `mcp.json` (`fetch`).

## Safety Considerations

- The Fetch MCP only performs HTTP GET requests.
- It honours `robots.txt` for autonomous fetches.
- It does **not** block localhost or private network addresses. Under Docker it can reach other Compose services and the host; under `pnpm dev`, your machine and LAN. See [Security Posture](../docs/architecture/9-security-posture.md).
- Fetched content is untrusted model input (prompt injection).

## Integration Details

The Fetch MCP is configured in `config/mcp.json` (stdio, `pnpm dev`) or `infra/app/config/mcp.json` (HTTP, Docker) and connected through a single `MCPAdapter` from `@langchain/mcp-adapters`. Tools are discovered on the first chat request.
