import { Router } from 'express';
import { getEvent, listEvents } from './controllers/events-controller';
import { registerForEvent } from './controllers/registration-controller';

export const routes = Router();

routes.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

routes.get('/events', listEvents);
routes.get('/events/:eventId', getEvent);
routes.post('/events/:eventId/registrations', registerForEvent);
