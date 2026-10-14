import assert from "node:assert/strict";
import { test } from "node:test";
import { createAdOrbitRequester } from "../lib/adOrbitRequest";

function fixture(statuses: number[], retryAfter?: string) {
    let time = 0;
    const starts: number[] = [];
    const request = createAdOrbitRequester({
        now: () => time,
        sleep: async ms => { time += ms; },
        fetch: async () => {
            starts.push(time);
            return new Response("{}", {
                status: statuses.shift() ?? 200,
                headers: retryAfter ? { "Retry-After": retryAfter } : {}
            });
        }
    });
    return { request, starts };
}

test("concurrent requests share spacing and a rate-limit cooldown", async () => {
    const { request, starts } = fixture([429, 200, 200], "10");
    const responses = await Promise.all([request("https://example.test/1"), request("https://example.test/2")]);
    assert.deepEqual(responses.map(response => response.status), [200, 200]);
    assert.deepEqual(starts, [0, 10000, 11000]);
});

test("Retry-After dates are respected", async () => {
    const { request, starts } = fixture([429, 200], "Thu, 01 Jan 1970 00:00:12 GMT");
    await request("https://example.test");
    assert.deepEqual(starts, [0, 12000]);
});

test("missing or invalid Retry-After uses exponential backoff", async () => {
    for (const header of [undefined, "invalid"]) {
        const { request, starts } = fixture([429, 429, 200], header);
        await request("https://example.test");
        assert.deepEqual(starts, [0, 2000, 6000]);
    }
});

test("exhausted retries retain the error and allow every later ID to proceed", async () => {
    const { request, starts } = fixture([429, 429, 429, 429, 429, 429, 200]);
    const failed = await request("https://example.test/failed");
    assert.equal(failed.status, 429);
    assert.equal(await failed.text(), "{}");
    assert.equal((await request("https://example.test/next")).status, 200);
    assert.deepEqual(starts, [0, 2000, 6000, 14000, 30000, 62000, 122000]);
});

test("non-rate-limit failures are not retried", async () => {
    const { request, starts } = fixture([400, 200]);
    assert.equal((await request("https://example.test/failed")).status, 400);
    assert.equal((await request("https://example.test/next")).status, 200);
    assert.deepEqual(starts, [0, 1000]);
});

test("transport rejection does not block the queue", async () => {
    let calls = 0;
    const request = createAdOrbitRequester({
        intervalMs: 1,
        fetch: async () => {
            if (++calls === 1) throw new Error("connection failed");
            return new Response("{}");
        }
    });
    await assert.rejects(request("https://example.test"), /connection failed/);
    assert.equal((await request("https://example.test")).status, 200);
});
