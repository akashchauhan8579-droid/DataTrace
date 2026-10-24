import type { ZodTypeAny } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteUser {
  id: string;
  accessToken: string;
}

export interface HandlerContext {
  req: Request;
  params: Record<string, string>;
  user: RouteUser;
  db: SupabaseClient;       // Scoped with user JWT (RLS applied)
  admin: SupabaseClient;    // Service-role (privileged writes after code ownership check)
}

export interface RouteDef {
  method: HttpMethod;
  pattern: string;          // e.g. '/health', '/cases', '/cases/:id/evidence'
  auth: 'user' | 'none';    // only /health is 'none'
  input?: ZodTypeAny;       // Zod input schema for body or query
  output?: ZodTypeAny;      // Zod output schema
  handler: (ctx: HandlerContext) => Promise<unknown | Response>;
}

export interface StandardErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
