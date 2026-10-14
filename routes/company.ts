import { Router } from 'express';

import { CompanyUpdateVerificationError, getCompany, updateCompany } from '../lib/adOrbit';
import { loadConfig } from '../lib/config';

const router = Router();

const stringProperties = new Set([
  'address1', 'address2', 'billingContactId', 'city', 'country', 'id', 'name',
  'collections', 'primaryRepId', 'state', 'website', 'zipCode', 'paymentTermId',
  'artworkContactId', 'digitalArtworkContactId', 'publisherId', 'special_note',
  'xref', 'company_credit', 'linkedin_url', 'twitter_url', 'facebook_url', 'primaryCatId',
]);
const integerProperties = new Set(['typeId', 'marketId']);
const booleanProperties = new Set(['readyForExport', 'isExportable', 'dead']);

function validateProperties(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 'Properties must be a JSON object';
  }
  const entries = Object.entries(value);
  if (!entries.length) return 'Provide at least one company property';
  for (const [key, field] of entries) {
    if (stringProperties.has(key)) {
      if (typeof field !== 'string') return `${key} must be a string`;
    } else if (integerProperties.has(key)) {
      if (!Number.isSafeInteger(field)) return `${key} must be an integer`;
    } else if (booleanProperties.has(key)) {
      if (typeof field !== 'boolean' && field !== 0 && field !== 1) {
        return `${key} must be a boolean or 0 or 1`;
      }
    } else {
      return `Unsupported company property: ${key}`;
    }
  }
}

function validId(value: unknown): value is string | number {
  return (typeof value === 'string' && /^[1-9]\d*$/.test(value)) ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
}

router.put('/bulk', async (request, response, next) => {
  const { companyIds, properties } = request.body ?? {};
  if (!Array.isArray(companyIds) || !companyIds.length || !companyIds.every(validId)) {
    response.status(400).json({ error: 'companyIds must be a nonempty array of positive integer IDs' });
    return;
  }
  const validationError = validateProperties(properties);
  if (validationError || Object.prototype.hasOwnProperty.call(properties, 'id')) {
    response.status(400).json({ error: validationError ?? 'id cannot be included in bulk properties' });
    return;
  }
  try {
    const config = await loadConfig();
    const results = [];
    for (const companyId of new Set<string>(companyIds.map(String))) {
      try {
        const company = await updateCompany({
          baseUrl: config.adOrbitBaseUrl,
          publicKey: config.adOrbitPublicKey,
          privateKey: config.adOrbitPrivateKey,
          companyId,
          properties,
        });
        results.push({ id: companyId, success: true, company });
      } catch (error) {
        results.push({ id: companyId, success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    const failedIds = results.filter(result => !result.success).map(result => result.id);
    response.status(failedIds.length ? 207 : 200).json({ count: results.length, results, failedIds });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (request, response, next) => {
  const validationError = validateProperties(request.body);
  if (!validId(request.params.id) || validationError ||
      (request.body.id !== undefined && request.body.id !== request.params.id)) {
    response.status(400).json({ error: validationError ?? 'Company ID must be a positive integer and body id must match the URL' });
    return;
  }
  try {
    const config = await loadConfig();
    const company = await updateCompany({
      baseUrl: config.adOrbitBaseUrl,
      publicKey: config.adOrbitPublicKey,
      privateKey: config.adOrbitPrivateKey,
      companyId: request.params.id,
      properties: request.body,
    });
    response.json(company);
  } catch (error) {
    if (error instanceof CompanyUpdateVerificationError) {
      response.status(502).json({ error: error.message });
      return;
    }
    next(error);
  }
});

router.get('/:id', async (request, response, next) => {
  try {
    const config = await loadConfig();
    const company = await getCompany({
      baseUrl: config.adOrbitBaseUrl,
      publicKey: config.adOrbitPublicKey,
      privateKey: config.adOrbitPrivateKey,
      companyId: request.params.id,
    });

    response.json(company);
  } catch (error) {
    next(error);
  }
});

export default router;
