import type { RouteDef } from './types';
import { healthRoute } from './routes/health';
import { casesRoutes } from './routes/cases';
import { evidenceRoutes } from './routes/evidence';
import { findingsRoutes } from './routes/findings';
import { analysisRoutes } from './routes/analysis';
import { matrixRoutes } from './routes/matrix';
import { reportsRoutes } from './routes/reports';
import { auditRoutes } from './routes/audit';

export const allRoutes: RouteDef[] = [
  healthRoute,
  ...casesRoutes,
  ...evidenceRoutes,
  ...findingsRoutes,
  ...analysisRoutes,
  ...matrixRoutes,
  ...reportsRoutes,
  ...auditRoutes,
];
