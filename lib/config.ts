import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PublicationConfig } from "./types.js";

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function validatePublication(value: unknown, index: number): PublicationConfig {
    if (!value || typeof value !== "object") {
        throw new Error(`Publication config at index ${index} must be an object`);
    }

    const item = value as Record<string, unknown>;
    const fields = [
        "name",
        "publicationId",
        "targetIssueId",
        "hubspotStatusProperty",
        "purchasedValue",
        "notPurchasedValue"
    ] as const;

    for (const field of fields) {
        if (typeof item[field] !== "string" || !item[field].trim()) {
            throw new Error(`Publication config ${index} has an invalid ${field}`);
        }
    }

    return Object.fromEntries(fields.map(field => [field, item[field]])) as unknown as PublicationConfig;
}

export async function loadConfig() {
    const publicationsPath = resolve(process.env.PUBLICATIONS_CONFIG || "./publications.json");
    const raw = JSON.parse(await readFile(publicationsPath, "utf8")) as unknown;
    if (!Array.isArray(raw) || raw.length === 0) {
        throw new Error("publications.json must contain at least one publication");
    }

    return {
        adOrbitBaseUrl: required("API_BASE_URL").replace(/\/$/, ""),
        adOrbitPublicKey: required("PUBLIC_KEY"),
        adOrbitPrivateKey: required("API_KEY"),
        hubSpotAccessToken: required("HUBSPOT_ACCESS_TOKEN"),
        hubSpotAdOrbitIdProperty: process.env.HUBSPOT_AD_ORBIT_ID_PROPERTY?.trim() || "ad_orbit_id",
        publications: raw.map(validatePublication)
    };
}
