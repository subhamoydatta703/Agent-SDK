export class AgentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentError';
  }
}

export class LoopDetectedError extends AgentError {
  constructor(toolName: string) {
    super(`Loop detected: tool '${toolName}' was called with identical arguments several times in a row.`);
    this.name = 'LoopDetectedError';
  }
}

export class HandoffLoopError extends AgentError {
  constructor(chain: string[], target: string) {
    super(`Handoff loop detected: agent '${target}' already appears in the recent handoff chain [${chain.join(' -> ')}].`);
    this.name = 'HandoffLoopError';
  }
}

export class AgentConfigError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = 'AgentConfigError';
  }
}

export class ToolDefinitionError extends AgentError {
  constructor(message: string) {
    super(message);
    this.name = 'ToolDefinitionError';
  }
}