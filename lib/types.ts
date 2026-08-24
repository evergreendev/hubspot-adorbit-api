export interface AdSale {
    id: string;
    issueId: string;
    publicationId: string;
    publication?: string;
    isKilled: string;
}

export interface AdOrbitOrder {
    id: string;
    companyID: string;
    company: string;
    adSales: AdSale[] | null;
}

export interface PublicationConfig {
    name: string;
    publicationId: string;
    targetIssueId: string;
    hubspotStatusProperty: string;
    purchasedValue: string;
    notPurchasedValue: string;
}

export interface HubSpotCompany {
    id: string;
    properties: Record<string, string | null>;
}
