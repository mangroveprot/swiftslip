import express from 'express';
import http from 'http';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { config } from '../../config';
import { default as AllRoutes } from '../../../common/global-router';
import { default as DefaultRoutes } from '../../../common/global-router/default';
import { apiRateLimiter } from '../../../common/shared/middlewares';
import {
  GlobalErrorHandler,
  NotFoundHandler,
} from '../../../common/shared/utils';

const morganEnv = config.runningProd ? 'combined' : 'dev';
const app = express();

app.disable('x-powered-by');
if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);
app.use(cors({ origin: config.cors.origins, credentials: true }));
app.use(helmet());
app.use(morgan(morganEnv));
app.use(compression());
app.use(express.json({ limit: config.bodyLimit }));
app.use(apiRateLimiter);

// API routes
app.use('/', DefaultRoutes);
app.use('/api', AllRoutes);

// Order matters: anything unmatched becomes a 404 *first*, and then the
// global handler turns every error (that 404 included) into the standard shape.
app.use(NotFoundHandler);
app.use(GlobalErrorHandler);

const server = http.createServer(app);

export default server;
