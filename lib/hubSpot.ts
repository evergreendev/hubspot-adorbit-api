import type { HubSpotCompany } from "./types.js";

const HUBSPOT_BASE_URL = "https://api.hubapi.com";

async function hubSpotRequest<T>(
    accessToken: string,
    path: string,
    init?: RequestInit
): Promise<T> {
    const response = await fetch(`${HUBSPOT_BASE_URL}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...init?.headers
        }
    });

    if (!response.ok) {
        throw new Error(`HubSpot request failed: ${response.status} ${await response.text()}`);
    }

    return response.json() as Promise<T>;
}

export async function getCompanies(
    accessToken: string,
    properties: string[]
): Promise<HubSpotCompany[]> {
    const companies: HubSpotCompany[] = [];
    let after: string | undefined;

    do {
        const params = new URLSearchParams({
            limit: "100",
            properties: properties.join(","),
            ...(after ? { after } : {})
        });
        const page = await hubSpotRequest<{
            results: HubSpotCompany[];
            paging?: { next?: { after?: string } };
        }>(accessToken, `/crm/v3/objects/companies?${params}`);

        companies.push(...page.results);
        after = page.paging?.next?.after;
    } while (after);

    return companies;
}

export async function batchUpdateCompanies(
    accessToken: string,
    updates: Array<{ id: string; properties: Record<string, string> }>
): Promise<void> {
    for (let index = 0; index < updates.length; index += 100) {
        const inputs = updates.slice(index, index + 100);
        await hubSpotRequest(accessToken, "/crm/v3/objects/companies/batch/update", {
            method: "POST",
            body: JSON.stringify({ inputs })
        });
    }
}
