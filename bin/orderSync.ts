import { getCurrentPrintOrders } from "../lib/adOrbit";
import { loadConfig } from "../lib/config.js";
import { batchUpdateCompanies, getCompanies } from "../lib/hubSpot.js";
import { planSync } from "../lib/sync.js";

async function main() {
    const dryRun = process.argv.includes("--dry-run");
    const config = await loadConfig();
    const statusProperties = config.publications.map((item: { hubspotStatusProperty: any; }) => item.hubspotStatusProperty);

    console.log(`Fetching Ad Orbit current-print orders...`);
    const orders = await getCurrentPrintOrders({
        baseUrl: config.adOrbitBaseUrl,
        publicKey: config.adOrbitPublicKey,
        privateKey: config.adOrbitPrivateKey
    });

    console.log(`Fetching HubSpot companies...`);
    const companies = await getCompanies(config.hubSpotAccessToken, [
        "name",
        config.hubSpotAdOrbitIdProperty,
        ...statusProperties
    ]);

    const plan = planSync({
        orders,
        companies,
        adOrbitIdProperty: config.hubSpotAdOrbitIdProperty,
        publications: config.publications
    });

    console.log("Purchased companies by publication:");
    for (const [publication, count] of Object.entries(plan.purchasedCounts)) {
        console.log(`  ${publication}: ${count}`);
    }
    console.log(`HubSpot companies requiring updates: ${plan.updates.length}`);

    if (plan.linkedByName.length > 0) {
        console.log("HubSpot companies matched by company name:");
        for (const item of plan.linkedByName) {
            console.log(`  ${item.company}: HubSpot ${item.hubSpotCompanyId} -> Ad Orbit ${item.adOrbitId}`);
        }
    }

    if (plan.unmatched.length > 0) {
        console.warn("Ad Orbit purchasers without a matching HubSpot company:");
        for (const item of plan.unmatched) {
            console.warn(`  ${item.adOrbitId}: ${item.company}`);
        }
    }

    if (dryRun) {
        console.log("Dry run: no HubSpot records were changed.");
        return;
    }

    await batchUpdateCompanies(config.hubSpotAccessToken, plan.updates);
    console.log(`Updated ${plan.updates.length} HubSpot companies.`);
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
