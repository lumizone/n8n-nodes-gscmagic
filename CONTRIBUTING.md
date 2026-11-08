# Contributing

## Development setup

Use Node.js 22 or newer (below 25) and npm 11 or newer.

```bash
npm install
npm run verify
```

For interactive testing in a local n8n instance:

```bash
npm run dev
```

## Pull requests

- Keep the public node UI and documentation in English.
- Add a failing test before changing behavior.
- Do not add runtime dependencies.
- Do not access environment variables or the filesystem from node or credential code.
- Preserve existing workflow parameter names unless the node version is bumped.
- Keep write operations out of the node. GSC Magic write tools stay reachable only through Call Any Tool.
- Run `npm run verify`, `npm audit --omit=dev --omit=peer --audit-level=high`, and `npm pack --dry-run` before opening a pull request.

## API behavior

The node is a thin adapter for the GSC Magic MCP endpoint (`tools/call` and `tools/list`). When a tool's arguments change in GSC Magic, update `nodes/GscMagic/shared/operations.ts` and its tests.
