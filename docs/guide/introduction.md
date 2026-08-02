# Introduction

Somoy (Bengali for *time*) is an original, open-source AI Agent SDK built from scratch in
TypeScript. It is **not** a wrapper around an existing agent framework. The core runtime — the agent
loop, tool calling, memory abstraction, handoffs, and guardrails — is hand-written and fully
inspectable.

## The pitch

- **Who it is for** — TypeScript developers who want an agent runtime they can read and modify in an
  afternoon, without inheriting a framework's opinions.
- **What problem it solves** — transparency and control. Every step of the loop is inspectable; there
  is no hidden prompt injection or magic retry logic.
- **Why it exists given LangChain / CrewAI / OpenAI Agents SDK** — smaller surface area, provider
  agnostic from day one, and TypeScript-first types rather than a port of a Python-first design.

## Three distinct state kinds

Somoy deliberately separates three kinds of state into distinct, typed modules:

| Kind | Purpose | Lifetime |
| --- | --- | --- |
| `AgentConfig` | instructions, model, tools, guardrails | static, defined once |
| `RunState` | current loop's transcript, tool calls, iteration count | ephemeral, per-invocation |
| Session turns | multi-turn history | persisted, survives across runs |

## Design principles

1. The loop is an explicit state machine, never a black box.
2. Provider-agnostic model layer (`ModelProvider`).
3. All expected failures return a `RunResult` — reserved thrown errors are for bugs.
4. Types flow from zod schemas through tools, structured output, and events.