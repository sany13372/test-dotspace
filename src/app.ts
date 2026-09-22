import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { routes } from './routes';

export const app = express();

app.disable('x-powered-by');
app.use(express.json());
app.use(routes);
app.use(notFoundHandler);
app.use(errorHandler);
