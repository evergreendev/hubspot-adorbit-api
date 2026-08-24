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
            )
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
    const payload = await adOrbitGet<unknown>({
        url: `${routes.orders}${separator}currentprint=1`,
        publicKey: options.publicKey,
        privateKey: options.privateKey
    });
    return extractOrders(payload);
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
