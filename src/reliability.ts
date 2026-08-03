export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`Operation '${label}' timed out after ${ms}ms.`);
    this.name = 'TimeoutError';
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => {
      if (timer) clearTimeout(timer);
      reject(new TimeoutError(label, ms));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
    timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new TimeoutError(label, ms));
    }, ms);
    promise.then(
      (value) => {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (err) => {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

export interface RetryOptions<T> {
  task: () => Promise<T>;
  maxRetries: number;
  baseDelayMs: number;
  isTransient: (err: unknown) => boolean;
  signal?: AbortSignal;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  jitter?: boolean;
}

export async function retryWithBackoff<T>(
  opts: RetryOptions<T>
): Promise<{ ok: true; value: T; attempts: number } | { ok: false; error: unknown; attempts: number }> {
  let attempts = 0;
  while (true) {
    if (opts.signal?.aborted) {
      return { ok: false, error: new Error('Run aborted'), attempts };
    }
    attempts += 1;
    try {
      const value = await opts.task();
      return { ok: true, value, attempts };
    } catch (err) {
      if (opts.signal?.aborted) {
        return { ok: false, error: new Error('Run aborted'), attempts };
      }
      if (attempts > opts.maxRetries || !(opts.isTransient ? opts.isTransient(err) : true)) {
        return { ok: false, error: err, attempts };
      }
      const delay = opts.baseDelayMs * 2 ** (attempts - 1);
      const finalDelay = opts.jitter === false ? delay : delay * (0.5 + Math.random());
      opts.onRetry?.(attempts, Math.round(finalDelay), err);
      if (opts.signal?.aborted) {
        return { ok: false, error: new Error('Run aborted'), attempts };
      }
      await sleep(finalDelay);
    }
  }
}