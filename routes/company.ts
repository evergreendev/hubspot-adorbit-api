import { Router } from 'express';

import { getCompany } from '../lib/adOrbit';
import { loadConfig } from '../lib/config';

const router = Router();

router.get('/:id', async (request, response, next) => {
  try {
    const config = await loadConfig();
    const company = await getCompany({
      baseUrl: config.adOrbitBaseUrl,
      publicKey: config.adOrbitPublicKey,
      privateKey: config.adOrbitPrivateKey,
      companyId: request.params.id,
    });

    response.json();
  } catch (error) {
    next(error);
  }
});

export default router;
