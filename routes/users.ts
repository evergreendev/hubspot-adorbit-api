import { Router } from 'express';

const router = Router();

router.get('/', (_request, response) => {
  response.send('respond with a resource');
});

export default router;
