import { Router } from 'express';

import { getCurrentPrintOrders } from '../lib/adOrbit';
import { loadConfig } from '../lib/config';

const router = Router();

router.get('/', async (_request, response, next) => {
  try {
    const config = await loadConfig();
    const orders = await getCurrentPrintOrders({
      baseUrl: config.adOrbitBaseUrl,
      publicKey: config.adOrbitPublicKey,
      privateKey: config.adOrbitPrivateKey,
    });

    response.json();
  } catch (error) {
    next(error);
  }
});

export default router;
