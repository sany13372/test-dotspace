import { NextFunction, Request, Response } from 'express';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'ROUTE_NOT_FOUND', message: 'Route was not found' },
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (process.env.NODE_ENV !== 'test') {
    console.error(error);
  }

  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' },
  });
}
