# Somoy

> **সোময়** — *time*. A transparent, hand-written AI Agent SDK for TypeScript.

Somoy is a provider-agnostic agent runtime whose think → act → observe loop is a single,
fully-readable state machine. No LangChain, no CrewAI, no OpenAI Agents SDK underneath — the loop,
tool-calling, memory, handoffs, and guardrails are all written from scratch. Model APIs, zod, and
small utilities are the only dependencies.

## Highlights

- **Readable loop.** `src/loop.ts` is an explicit state machine with named exit paths.
- **One `ModelProvider`, many models.** Gemini, OpenAI, and a keyless `MockProvider` ship in the box.
- **TypeScript-first types.** Everything is inferred from zod schemas.
- **Failures are values, not throws.** Every exit returns a `RunResult` with a `status` discriminant.
- **Runtime-agnostic.** Bun and Node 18+.

## Start here

- [Installation](/guide/installation)
- [Quick Start](/guide/quick-start)
- [Examples](/examples/basic)