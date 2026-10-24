import type { RouteDef } from './types';
import { healthRoute } from './routes/health';
import { casesRoutes } from './routes/cases';
import { evidenceRoutes } from './routes/evidence';
import { findingsRoutes } from './routes/findings';
import { reportsRoutes } from './routes/reports';
import { auditRoutes } from './routes/audit';

export const allRoutes: RouteDef[] = [
  healthRoute,
  ...casesRoutes,
  ...evidenceRoutes,
  ...findingsRoutes,
  ...reportsRoutes,
  ...auditRoutes,
];
