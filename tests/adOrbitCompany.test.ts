import assert from "node:assert/strict";
import { test } from "node:test";

test("a rate-limited verification GET retries without repeating the successful PUT", async () => {
    process.env.ADORBIT_REQUEST_INTERVAL_MS = "1";
    const { updateCompany } = await import("../lib/adOrbit");
    const originalFetch = globalThis.fetch;
    const methods: string[] = [];
    globalThis.fetch = async (_url, init) => {
        methods.push(init?.method ?? "GET");
        if (methods.length === 2) return new Response("rate limited", { status: 429 });
        return new Response(JSON.stringify({ active: 1 }));
    };
    try {
        assert.deepEqual(await updateCompany({
            baseUrl: "https://example.test", publicKey: "test", privateKey: "test",
            companyId: "1465", properties: { dead: 0 }
        }), { active: 1 });
        assert.deepEqual(methods, ["PUT", "GET", "GET"]);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
