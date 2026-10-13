import { Router } from 'express';
import { getCompanies, getCompanyPropertyDefinitions, updateHubSpotCompany } from '../lib/hubSpot';

const router = Router();
const allowedProperties = new Set(['archived', 'bh_family_status']);
const normalizeName = (name: string) => name.trim().toLowerCase();

router.put('/bulk', async (request, response) => {
  const { companyNames, properties } = request.body ?? {};
  if (!Array.isArray(companyNames) || !companyNames.length ||
      !companyNames.every(name => typeof name === 'string' && name.trim())) {
    response.status(400).json({ error: 'companyNames must be a nonempty array of nonempty strings' });
    return;
  }
  if (!properties || typeof properties !== 'object' || Array.isArray(properties) ||
      !Object.keys(properties).length || Object.entries(properties).some(([key, value]) =>
        !allowedProperties.has(key) || typeof value !== 'string')) {
    response.status(400).json({ error: 'properties must contain archived and/or bh_family_status with string values' });
    return;
  }
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!accessToken) {
    response.status(500).json({ error: 'Missing required environment variable: HUBSPOT_ACCESS_TOKEN' });
    return;
  }
  try {
    console.log(`[HubSpot bulk update] Loading company records for ${companyNames.length} requested names`);
    const definitions = await getCompanyPropertyDefinitions(accessToken);
    for (const [key, value] of Object.entries(properties)) {
      const definition = definitions.find(property => property.name === key);
      if (!definition || definition.modificationMetadata?.readOnlyValue ||
          (definition.type === 'enumeration' && !definition.options.some(option => option.value === value))) {
        response.status(400).json({ error: `Unknown, read-only, or invalid value for company property ${key}` });
        return;
      }
    }
    const companies = await getCompanies(accessToken, ['name', ...Object.keys(properties)]);
    const byName = new Map<string, typeof companies>();
    for (const company of companies) {
      const name = company.properties.name;
      if (!name) continue;
      const key = normalizeName(name);
      const matches = byName.get(key) ?? [];
      matches.push(company);
      byName.set(key, matches);
    }
    const names = new Map<string, string>();
    for (const name of companyNames as string[]) names.set(normalizeName(name), name.trim());
    const results = [];
    console.log(`[HubSpot bulk update] Loaded ${companies.length} company records; processing ${names.size} unique names`);
    for (const [key, name] of names) {
      if (results.length > 0 && results.length % 25 === 0) {
        console.log(`[HubSpot bulk update] Processed ${results.length}/${names.size} names`);
      }
      const matches = byName.get(key) ?? [];
      if (matches.length !== 1) {
        if (matches.length === 0) {
          console.warn(`[HubSpot bulk update] Company not found: ${JSON.stringify(name)}`);
        }
        results.push({ name, success: false,
          error: matches.length ? 'Multiple companies match this name; no update performed' : 'Company not found',
          matchingIds: matches.map(company => company.id) });
        continue;
      }
      const id = matches[0].id;
      try {
        const company = await updateHubSpotCompany(accessToken, id, properties);
        results.push({ name, id, success: true, company });
      } catch (error) {
        results.push({ name, id, success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    console.log(`[HubSpot bulk update] Finished: ${results.filter(result => result.success).length} succeeded, ${results.filter(result => !result.success).length} failed`);
    response.status(results.some(result => !result.success) ? 207 : 200).json({ count: results.length, results });
  } catch (error) {
    response.status(502).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
