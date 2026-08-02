# Installation

Somoy runs on **Bun** and **Node.js 18+**. It ships as ESM with TypeScript declarations.

## Install

```bash
# bun
bun add @subhamoy/somoy

# npm
npm install @subhamoy/somoy
# or pnpm / yarn
```

## Peer expectations

- `zod` is used for validation and is bundled as a dependency — you do not need to install it.
- No API key is required to build or test agents; use `MockProvider` for offline development.
- To call live models, set an env var (`GEMINI_API_KEY` or `OPENAI_API_KEY`) or pass a key to the
  adapter when you construct it.

## Optional (persistent sessions with SQLite)

`SQLiteSessionStore` dynamically uses `bun:sqlite`, `node:sqlite` (Node ≥ 22.5), or
`better-sqlite3` — whichever your runtime can load. No driver is a hard dependency.

## Build from source

```bash
git clone <repo>
cd somoy
bun install
bun run typecheck
bun test
bun run build
```