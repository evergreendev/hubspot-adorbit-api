import { createHmac } from "node:crypto";
import type { AdOrbitOrder } from "./types.js";

export function createAdOrbitAuthorization(
    method: string,
    url: string,
    publicKey: string,
    privateKey: string
): string {
    const message = `${method.toUpperCase()}\n${url}`;
    const signature = createHmac("sha512", privateKey)
        .update(message)
        .digest("hex");
    const encodedSignature = Buffer.from(signature).toString("base64");
    return `ADORBIT ${publicKey}:${encodedSignature}`;
}

async function adOrbitGet<T>(options: {
    url: string;
    publicKey: string;
    privateKey: string;
    headers?: Record<string, string>;
}): Promise<T> {
    const method = "GET";
    const response = await fetch(options.url, {
        headers: {
            Accept: "application/json",
            Method: method,
            Authorization: createAdOrbitAuthorization(
                method,
                options.url,
                options.publicKey,
                options.privateKey
            ),
            ...options.headers
        }
    });

    if (!response.ok) {
        throw new Error(`Ad Orbit request failed: ${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
}

function extractOrders(payload: unknown): AdOrbitOrder[] {
    if (Array.isArray(payload)) return payload as AdOrbitOrder[];
    if (payload && typeof payload === "object") {
        const object = payload as Record<string, unknown>;
        for (const key of ["orders", "results", "data"]) {
            if (Array.isArray(object[key])) return object[key] as AdOrbitOrder[];
        }
    }
    throw new Error("Ad Orbit returned an unexpected orders response shape");
}

export async function getCurrentPrintOrders(options: {
    baseUrl: string;
    publicKey: string;
    privateKey: string;
}): Promise<AdOrbitOrder[]> {
    const routes = await adOrbitGet<Record<string, unknown>>({
        url: `${options.baseUrl}/`,
        publicKey: options.publicKey,
        privateKey: options.privateKey
    });
    if (typeof routes.orders !== "string") {
        throw new Error("Ad Orbit route discovery did not return an orders URL");
    }
    const separator = routes.orders.includes("?") ? "&" : "?";
    const url = `${routes.orders}`;
    const limit = 100;
    const orders: AdOrbitOrder[] = [];
    const changedSince = new Date();
    changedSince.setUTCMonth(changedSince.getUTCMonth() - 3);

    for (let offset = 0; ; offset += 1) {
        const payload = await adOrbitGet<unknown>({
            url,
            publicKey: options.publicKey,
            privateKey: options.privateKey,
            headers: {
                "X-OPT-CHANGEDSINCE": changedSince.toISOString(),
                "X-OPT-LIMIT": String(limit),
                "X-OPT-OFFSET": String(offset)
            }
        });
        const page = extractOrders(payload);
        orders.push(...page);

        if (page.length < limit) return orders;
    }
}

export async function getCompany(options: {
    baseUrl: string;
    publicKey: string;
    privateKey: string;
    companyId: string;
}): Promise<unknown> {
    return adOrbitGet<unknown>({
        url: `${options.baseUrl}/companies/${encodeURIComponent(options.companyId)}`,
        publicKey: options.publicKey,
        privateKey: options.privateKey
    });
}

export async function updateCompany(options: {
    baseUrl: string;
    publicKey: string;
    privateKey: string;
    companyId: string;
    properties: Record<string, unknown>;
}): Promise<unknown> {
    const url = `${options.baseUrl}/companies/${encodeURIComponent(options.companyId)}`;
    const method = "PUT";
    const fields = new URLSearchParams();
    for (const [key, value] of Object.entries(options.properties)) {
        fields.set(key, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
    }
    const response = await fetch(url, {
        method,
        headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            Method: method,
            Authorization: createAdOrbitAuthorization(method, url, options.publicKey, options.privateKey)
        },
        body: fields.toString()
    });
    if (!response.ok) {
        throw new Error(`Ad Orbit request failed: ${response.status} ${await response.text()}`);
    }
    // A successful HTTP response alone does not confirm that Ad Orbit applied the fields.
    await response.text();
    const company = await getCompany(options);
    if (!company || typeof company !== "object" || Array.isArray(company)) {
        throw new CompanyUpdateVerificationError("Ad Orbit returned an unexpected company response after updating");
    }
    const record = company as Record<string, unknown>;
    for (const [key, expected] of Object.entries(options.properties)) {
        if (key === "dead") {
            const active = record.active;
            const actualDead = Object.prototype.hasOwnProperty.call(record, "dead")
                ? record.dead
                : active === true || active === 1 || active === "1" ? 0
                : active === false || active === 0 || active === "0" ? 1 : undefined;
            if (actualDead === undefined || String(Number(actualDead)) !== String(Number(expected))) {
                throw new CompanyUpdateVerificationError(`Ad Orbit did not confirm dead=${Number(expected)} for company ${options.companyId} (active=${String(active)})`);
            }
        } else if (Object.prototype.hasOwnProperty.call(record, key)) {
            const actual = record[key];
            const matches = typeof expected === "boolean"
                ? Number(actual) === Number(expected)
                : String(actual) === String(expected);
            if (!matches) {
                throw new CompanyUpdateVerificationError(`Ad Orbit did not apply ${key} for company ${options.companyId}`);
            }
        }
    }
    return company;
}

export class CompanyUpdateVerificationError extends Error {}
