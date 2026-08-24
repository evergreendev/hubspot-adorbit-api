import type {
    AdOrbitOrder,
    HubSpotCompany,
    PublicationConfig
} from "./types.js";

export interface PlannedUpdate {
    id: string;
    properties: Record<string, string>;
}

export interface SyncPlan {
    updates: PlannedUpdate[];
    linkedByName: Array<{ adOrbitId: string; company: string; hubSpotCompanyId: string }>;
    unmatched: Array<{ adOrbitId: string; company: string }>;
    purchasedCounts: Record<string, number>;
}

function normalizeCompanyName(value: string): string {
    return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function planSync(options: {
    orders: AdOrbitOrder[];
    companies: HubSpotCompany[];
    adOrbitIdProperty: string;
    publications: PublicationConfig[];
}): SyncPlan {
    const purchasedByPublication = new Map<string, Set<string>>(
        options.publications.map(publication => [publication.name, new Set<string>()])
    );

    for (const order of options.orders) {
        for (const publication of options.publications) {
            const purchased = order.adSales?.some(adSale =>
                adSale.publicationId === publication.publicationId &&
                adSale.issueId === publication.targetIssueId &&
                adSale.isKilled !== "1"
            );
            if (purchased) purchasedByPublication.get(publication.name)?.add(order.companyID);
        }
    }

    const companiesByAdOrbitId = new Map<string, HubSpotCompany>();
    const companiesByName = new Map<string, HubSpotCompany[]>();
    for (const company of options.companies) {
        const id = company.properties[options.adOrbitIdProperty]?.trim();
        if (id) companiesByAdOrbitId.set(id, company);

        const name = company.properties.name?.trim();
        if (name) {
            const normalizedName = normalizeCompanyName(name);
            const matches = companiesByName.get(normalizedName) ?? [];
            matches.push(company);
            companiesByName.set(normalizedName, matches);
        }
    }

    const targetOrdersByCompanyId = new Map<string, AdOrbitOrder>();
    for (const order of options.orders) {
        const isTargetPurchase = options.publications.some(publication =>
            order.adSales?.some(adSale =>
                adSale.publicationId === publication.publicationId &&
                adSale.issueId === publication.targetIssueId &&
                adSale.isKilled !== "1"
            )
        );
        if (isTargetPurchase) targetOrdersByCompanyId.set(order.companyID, order);
    }

    const effectiveAdOrbitIds = new Map<string, string>();
    for (const [adOrbitId, company] of companiesByAdOrbitId) {
        effectiveAdOrbitIds.set(company.id, adOrbitId);
    }

    const linkedByName: SyncPlan["linkedByName"] = [];
    const claimedHubSpotCompanyIds = new Set(
        [...targetOrdersByCompanyId.keys()]
            .map(adOrbitId => companiesByAdOrbitId.get(adOrbitId)?.id)
            .filter((id): id is string => Boolean(id))
    );
    for (const [adOrbitId, order] of targetOrdersByCompanyId) {
        if (companiesByAdOrbitId.has(adOrbitId)) continue;

        const nameMatches = companiesByName.get(normalizeCompanyName(order.company)) ?? [];
        if (nameMatches.length !== 1) continue;

        const company = nameMatches[0];
        if (claimedHubSpotCompanyIds.has(company.id)) continue;

        companiesByAdOrbitId.set(adOrbitId, company);
        effectiveAdOrbitIds.set(company.id, adOrbitId);
        claimedHubSpotCompanyIds.add(company.id);
        linkedByName.push({
            adOrbitId,
            company: order.company,
            hubSpotCompanyId: company.id
        });
    }

    const updates: PlannedUpdate[] = [];
    for (const company of options.companies) {
        const adOrbitId = effectiveAdOrbitIds.get(company.id);
        if (!adOrbitId) continue;

        const properties: Record<string, string> = {};
        if (company.properties[options.adOrbitIdProperty]?.trim() !== adOrbitId) {
            properties[options.adOrbitIdProperty] = adOrbitId;
        }
        for (const publication of options.publications) {
            const nextValue = purchasedByPublication.get(publication.name)?.has(adOrbitId)
                ? publication.purchasedValue
                : publication.notPurchasedValue;
            if (company.properties[publication.hubspotStatusProperty] !== nextValue) {
                properties[publication.hubspotStatusProperty] = nextValue;
            }
        }

        if (Object.keys(properties).length > 0) updates.push({ id: company.id, properties });
    }

    const unmatchedById = new Map<string, string>();
    for (const order of targetOrdersByCompanyId.values()) {
        if (!companiesByAdOrbitId.has(order.companyID)) {
            unmatchedById.set(order.companyID, order.company);
        }
    }

    return {
        updates,
        linkedByName,
        unmatched: [...unmatchedById].map(([adOrbitId, company]) => ({ adOrbitId, company })),
        purchasedCounts: Object.fromEntries(
            [...purchasedByPublication].map(([name, ids]) => [name, ids.size])
        )
    };
}
