import { z } from 'zod';
import type { RouteDef } from '../types';

export const HealthOutputSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  timestamp: z.string().datetime(),
  environment: z.string(),
});

export const healthRoute: RouteDef = {
  method: 'GET',
  pattern: '/health',
  auth: 'none',
  output: HealthOutputSchema,
  handler: async () => {
    return {
      status: 'ok' as const,
      version: '1.4.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    };
  },
};
