import { Router } from 'express';

const router = Router();

router.get('/', (_request, response) => {
  response.render('index', { title: 'Express' });
});

export default router;
