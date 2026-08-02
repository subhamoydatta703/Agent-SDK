import { randomUUID } from 'crypto';
import type { AgentConfig, RunConfig } from './types.js';
import { DEFAULT_RUN_CONFIG } from './types.js';
import type { SessionStore } from './session/types.js';
import { InMemorySessionStore } from './session/memory.js';
import { AgentEventBus } from './events.js';
import type { RunResult } from './result.js';
import { execute } from './loop.js';
import { AgentConfigError } from './errors.js';

export interface RunOptions {
  sessionId?: string;
  sessionStore?: SessionStore;
  signal?: AbortSignal;
  events?: AgentEventBus;
  runConfig?: Partial<RunConfig>;
  registry?: AgentRegistry;
}

export class Agent {
  readonly config: AgentConfig;

  constructor(config: AgentConfig) {
    if (!config.name || !/^[a-zA-Z0-9_-]+$/.test(config.name)) {
      throw new AgentConfigError(`Agent name '${String(config.name)}' must be non-empty and contain only [a-zA-Z0-9_-].`);
    }
    if (!config.instructions || !config.instructions.trim()) {
      throw new AgentConfigError(`Agent '${config.name}' requires non-empty instructions.`);
    }
    if (!config.model) {
      throw new AgentConfigError(`Agent '${config.name}' requires a model provider.`);
    }
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  async run<T = unknown>(input: string, opts: RunOptions = {}): Promise<RunResult<T>> {
    const runConfig: RunConfig = { ...DEFAULT_RUN_CONFIG, ...opts.runConfig };
    const sessionId = opts.sessionId ?? `session_${randomUUID()}`;
    const sessionStore = opts.sessionStore ?? new InMemorySessionStore();
    const events = opts.events ?? new AgentEventBus();
    const runId = randomUUID();
    return (await execute({
      runId,
      sessionId,
      sessionStore,
      initialAgent: this.config,
      input,
      runConfig,
      registry: opts.registry?.toMap(),
      events,
      signal: opts.signal,
    })) as RunResult<T>;
  }
}

export class AgentRegistry {
  private map = new Map<string, AgentConfig>();

  constructor(agents?: Iterable<Agent>) {
    for (const a of agents ?? []) this.map.set(a.name, a.config);
  }

  add(agent: Agent): this {
    this.map.set(agent.name, agent.config);
    return this;
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  get(name: string): AgentConfig | undefined {
    return this.map.get(name);
  }

  names(): string[] {
    return [...this.map.keys()];
  }

  toMap(): Map<string, AgentConfig> {
    return new Map(this.map);
  }
}