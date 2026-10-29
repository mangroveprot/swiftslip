import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config } from '../../config';
import { default as AllRoutes } from '../../../common/global-router';
import { default as DefaultRoutes } from '../../../common/global-router/default';
import { apiRateLimiter } from '../../../common/shared/middlewares';
import { logger } from '../../../common/shared/services';
import {
  GlobalErrorHandler,
  NotFoundHandler,
} from '../../../common/shared/utils';

const morganEnv = config.runningProd ? 'combined' : 'dev';
const app = express();

// ── Web app (optional) ──────────────────────────────────────────────────────
// In production one container serves both the API and the built website
// (web/dist). Same origin means the SameSite=Lax session cookie, CORS and the
// API base URL all need no special setup.
const webDist = config.webDist ? path.resolve(config.webDist) : undefined;
const serveWeb = !!webDist && fs.existsSync(path.join(webDist, 'index.html'));
if (webDist && !serveWeb) {
  logger.warn(
    `WEB_DIST=${webDist} has no index.html: serving the API only. ` +
      'Build the web app first (npm run build).',
  );
}

/**
 * Security headers for the website. Keep in sync with `securityHeaders()` in
 * web/vite.config.ts (used by `vite preview`) and web/public/_headers.
 */
const webHelmet = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'none'"],
      'object-src': ["'none'"],
      'script-src': ["'self'"],
      'style-src': [
        "'self'",
        "'unsafe-inline'",
        'https://fonts.googleapis.com',
      ],
      'img-src': [
        "'self'",
        'data:',
        'blob:',
        'https://*.supabase.co',
        'https://ticketing.regasco.ph:2424',
      ],
      'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
      'connect-src': ["'self'", 'https://*.supabase.co'],
      'worker-src': ["'self'", 'blob:'],
    },
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
});

app.disable('x-powered-by');
if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);
app.use(cors({ origin: config.cors.origins, credentials: true }));
if (serveWeb) {
  app.use(webHelmet);
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    next();
  });
} else {
  app.use(helmet());
}
app.use(compression());

// Static files go BEFORE morgan and the rate limiter, so loading the site
// (dozens of asset requests) neither floods the log nor eats the API's quota.
if (serveWeb && webDist) {
  app.use(
    express.static(webDist, {
      index: 'index.html',
      setHeaders: (res, filePath) => {
        // Vite fingerprints everything under /assets, so it can be cached for
        // good; everything else (index.html, templates) is revalidated.
        const hashed = filePath.includes(`${path.sep}assets${path.sep}`);
        res.setHeader(
          'Cache-Control',
          hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );
}

app.use(morgan(morganEnv));
app.use(express.json({ limit: config.bodyLimit }));
app.use('/api', apiRateLimiter);

// API routes
app.use('/', DefaultRoutes);
app.use('/api', AllRoutes);

// SPA fallback: a client-side route such as /records/123 must return the app.
// Never for /api or /health (they keep their JSON 404), and never for a path
// with a file extension (a missing /assets/x.js must 404, not return HTML).
if (serveWeb && webDist) {
  app.get(/^\/(?!api(?:\/|$)|health(?:\/|$)).*/, (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

// Order matters: anything unmatched becomes a 404 *first*, and then the
// global handler turns every error (that 404 included) into the standard shape.
app.use(NotFoundHandler);
app.use(GlobalErrorHandler);

const server = http.createServer(app);

export default server;
