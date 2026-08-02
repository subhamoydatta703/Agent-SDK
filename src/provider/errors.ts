export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelError';
  }
}

export class TransientModelError extends ModelError {
  constructor(message: string) {
    super(message);
    this.name = 'TransientModelError';
  }
}

export class PermanentModelError extends ModelError {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentModelError';
  }
}