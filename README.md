# Sophos Agent

## Quickstart

To start the entire system, run the following command:

```sh
docker compose -f infra/compose.yml up --env-file .env --build -d
```

This will build the `web` service and start all the required services. You can then access the web interface at [http://localhost:5173](http://localhost:5173).

## Examples

Check out our examples to see how the agent uses MCP tools:

- [Memory MCP Example](./docs/examples/memory-mcp-example.md) - Demonstrates reading and writing memory entries
- [Fetch MCP Example](./docs/examples/fetch-mcp-example.md) - Demonstrates performing safe HTTP GET requests

---

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
