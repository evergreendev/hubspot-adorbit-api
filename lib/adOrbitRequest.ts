import { setTimeout as sleep } from "node:timers/promises";

// Serialize requests as well as retries so concurrent bulk jobs share a cooldown.
export function createAdOrbitRequester(options: {
    intervalMs?: number;
    maxRetries?: number;
    fetch?: typeof fetch;
    now?: () => number;
    sleep?: (ms: number) => Promise<unknown>;
} = {}) {
    const intervalMs = options.intervalMs ?? 1000;
    const maxRetries = options.maxRetries ?? 5;
    const send = options.fetch ?? ((url, init) => fetch(url, init));
    const now = options.now ?? Date.now;
    const wait = options.sleep ?? sleep;
    let nextRequestAt = 0;
    let queue: Promise<unknown> = Promise.resolve();

    return (url: string, init?: RequestInit): Promise<Response> => {
        const result = queue.then(async () => {
            for (let attempt = 0; ; attempt++) {
                const delay = nextRequestAt - now();
                if (delay > 0) await wait(delay);
                nextRequestAt = now() + intervalMs;
                const response = await send(url, init);
                if (response.status !== 429) return response;

                const header = response.headers.get("Retry-After");
                const seconds = header === null || header.trim() === "" ? NaN : Number(header);
                const retryAfterMs = Number.isFinite(seconds)
                    ? Math.max(0, seconds * 1000)
                    : Math.max(0, Date.parse(header ?? "") - now());
                const backoffMs = Math.min(60000, 2000 * 2 ** attempt);
                nextRequestAt = Math.max(nextRequestAt, now() + backoffMs,
                    now() + (Number.isFinite(retryAfterMs) ? retryAfterMs : 0));
                if (attempt >= maxRetries) return response;
                await response.arrayBuffer();
            }
        });
        queue = result.catch(() => undefined);
        return result;
    };
}

function positiveInterval(value: string | undefined): number {
    if (value === undefined) return 1000;
    const interval = Number(value);
    if (!Number.isSafeInteger(interval) || interval < 1) {
        throw new Error("ADORBIT_REQUEST_INTERVAL_MS must be a positive integer");
    }
    return interval;
}

export const adOrbitRequest = createAdOrbitRequester({
    intervalMs: positiveInterval(process.env.ADORBIT_REQUEST_INTERVAL_MS)
});
