import fs from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { requireAuth, requirePasswordCurrent } from './auth.js';
import { config } from './config.js';
import { pool } from './db.js';
import { errorHandler, HttpError } from './lib.js';
import analytics from './routes/analytics.js';
import auditRoutes from './routes/audit.js';
import auth from './routes/auth.js';
import integrations from './routes/integrations.js';
import me from './routes/me.js';
import policies from './routes/policies.js';
import products from './routes/products.js';
import publicApi from './routes/publicApi.js';
import quotes from './routes/quotes.js';
import settings from './routes/settings.js';
import users from './routes/users.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind the cloud load balancer
  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
  }));
  app.use(express.json({ limit: '3mb' }));
  app.use(cookieParser());

  app.get('/healthz', async (_req, res) => {
    try {
      await pool.query('select 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'db_unavailable' });
    }
  });

  // Mutating API calls from the browser must be JSON (blocks cross-site HTML form posts)
  app.use('/api', (req, _res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.headers['content-length'] !== '0' && !req.is('application/json') && req.body && Object.keys(req.body).length) {
      return next(new HttpError(415, 'Content-Type must be application/json'));
    }
    next();
  });

  app.use('/api/auth', auth);
  app.use('/api/v1', publicApi);
  app.use('/api/me', requireAuth, me);

  const secured = express.Router();
  secured.use(requireAuth, requirePasswordCurrent);
  secured.use('/users', users);
  secured.use('/products', products);
  secured.use('/quotes', quotes);
  secured.use('/policies', policies);
  secured.use('/analytics', analytics);
  secured.use('/settings', settings);
  secured.use('/integrations', integrations);
  secured.use('/audit', auditRoutes);
  app.use('/api', secured);

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // Serve the built React app (single deployable container)
  const index = path.join(config.webDist, 'index.html');
  if (fs.existsSync(index)) {
    app.use(express.static(config.webDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(index));
  }

  app.use(errorHandler);
  return app;
}
