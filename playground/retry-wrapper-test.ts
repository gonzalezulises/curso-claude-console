

type RetryableError = { status: number; retryAfterSec?: number };

function shouldRetry(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function computeBackoffMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec !== undefined) {
    return retryAfterSec * 1000; // respetar el header del servidor
  }
  const base = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s...
  const jitter = Math.random() * base * 0.25; // ±25% jitter
  return Math.min(base + jitter, 30_000); // cap a 30s
}

async function withRetries<T>(
  fn: () => Promise<T>,
  opts: { maxRetries: number } = { maxRetries: 3 }
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const status: number = err.status ?? 0;
      const retryAfter = parseInt(err.headers?.["retry-after"] ?? "", 10);

      if (!shouldRetry(status) || attempt >= opts.maxRetries) {
        throw err;
      }

      const waitMs = computeBackoffMs(attempt, isNaN(retryAfter) ? undefined : retryAfter);
      console.error(`[retry] intento ${attempt + 1}/${opts.maxRetries} — status=${status} — esperando ${Math.round(waitMs)}ms`);
      await new Promise((r) => setTimeout(r, waitMs));
      attempt++;
    }
  }
}

// Test 1: computeBackoffMs sin retry-after (backoff exponencial con jitter)
console.log("Backoff sin retry-after (exponencial + jitter):");
for (let i = 0; i < 5; i++) {
  console.log(`  attempt=${i}: ${Math.round(computeBackoffMs(i))}ms`);
}

// Test 2: computeBackoffMs con retry-after del servidor
console.log("\nBackoff con retry-after=7 del servidor:");
console.log(`  resultado: ${computeBackoffMs(0, 7)}ms (debe ser 7000)`);

// Test 3: shouldRetry
console.log("\nshouldRetry por código HTTP:");
for (const s of [400, 401, 403, 404, 408, 429, 500, 529]) {
  console.log(`  ${s}: ${shouldRetry(s)}`);
}

// Test 4: wrapper con una función que falla 2 veces y después funciona
console.log("\nSimulación: wrapper con fallo transitorio (fake 429 dos veces, después OK):");
let failsRemaining = 2;
const fakeCall = async () => {
  if (failsRemaining > 0) {
    failsRemaining--;
    const e: any = new Error("rate limit");
    e.status = 429;
    e.headers = { "retry-after": "1" };
    throw e;
  }
  return { content: [{ type: "text", text: "ok" }] };
};

withRetries(fakeCall, { maxRetries: 3 }).then((r) => {
  console.log("Resultado final:", JSON.stringify(r));
});
