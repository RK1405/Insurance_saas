// Public (no login) customer payment page API, addressed by an unguessable link token.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { ah, parse } from '../lib.js';
import { completePayment, getPayment } from '../services/payments.js';

const r = Router();
r.use(rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));

r.get('/:token', ah(async (req, res) => {
  res.json({ payment: await getPayment(req.params.token) });
}));

r.post('/:token/complete', ah(async (req, res) => {
  const { method } = parse(z.object({ method: z.enum(['upi', 'card', 'netbanking']) }), req.body);
  res.json({ payment: await completePayment(req.params.token, method) });
}));

export default r;
