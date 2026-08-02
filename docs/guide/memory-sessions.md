# Sessions & Memory

Sessions store **turns**, not raw strings. A turn is a structured object with a role, content, tool
calls, tool results, timestamp, and agent name — so history can be replayed, truncated, or
summarized later without string parsing.

## SessionStore interface

```ts
interface SessionStore {
  get(sessionId: string): Promise<Turn[]>;
  append(sessionId: string, turn: Turn): Promise<void>;
  clear(sessionId: string): Promise<void>;
}
```

## In-memory (default)

```ts
import { Agent, InMemorySessionStore } from '@subhamoy/somoy';

const store = new InMemorySessionStore();
await agent.run('first', { sessionId: 'conv-1', sessionStore: store });
await agent.run('and then?', { sessionId: 'conv-1', sessionStore: store }); // continues the conversation
```

## SQLite (persistent)

```ts
import { SQLiteSessionStore } from '@subhamoy/somoy';

const store = await SQLiteSessionStore.open('./sessions.db');
// reuses bun:sqlite, node:sqlite, or better-sqlite3 automatically
```

## Bounded context windows

History can grow unboundedly. Somoy lets you plug in a `truncate` hook that runs before each model
call to keep the context window finite.

```ts
await agent.run('input', {
  runConfig: {
    truncate: (turns) => turns.slice(-10), // keep the last 10 turns
  },
});
```

The `truncate` function receives the full history and returns the slice to send to the model.