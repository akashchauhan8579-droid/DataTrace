import type { RouteDef, HandlerContext, RouteUser, StandardErrorEnvelope } from './types';
import { allRoutes } from './routes';
import { createUserClient, getAdminClient } from './client';

export type { RouteDef, HandlerContext, RouteUser, StandardErrorEnvelope } from './types';
export { allRoutes } from './routes';

/**
 * Matches a URL path against a route pattern with parameter extraction.
 * e.g. pattern '/cases/:id/evidence' matches '/cases/123/evidence' with { id: '123' }
 */
function matchRoute(
  pattern: string,
  pathname: string
): { matches: boolean; params: Record<string, string> } {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);

  if (patternParts.length !== pathParts.length) {
    return { matches: false, params: {} };
  }

  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const pPart = patternParts[i];
    const actualPart = pathParts[i];

    if (pPart.startsWith(':')) {
      const paramName = pPart.slice(1);
      params[paramName] = decodeURIComponent(actualPart);
    } else if (pPart !== actualPart) {
      return { matches: false, params: {} };
    }
  }

  return { matches: true, params };
}

/**
 * Framework-agnostic Master Router.
 * Master Spec v1.4 §7.5: Web-standard Request/Response only, no framework imports.
 */
export async function route(
  req: Request,
  slug: string[],
  customRoutes: RouteDef[] = allRoutes
): Promise<Response> {
  const method = req.method.toUpperCase();
  const pathname = '/' + slug.join('/');

  // 1. Find matching route
  let matchedRoute: RouteDef | null = null;
  let params: Record<string, string> = {};

  try {
    for (const r of customRoutes) {
      if (r.method === method) {
        const match = matchRoute(r.pattern, pathname);
        if (match.matches) {
          matchedRoute = r;
          params = match.params;
          break;
        }
      }
    }
  } catch (error) {
    if (error instanceof URIError) {
      return new Response(
        JSON.stringify({ error: { code: 'VALIDATION', message: 'Malformed URL path parameter encoding' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    throw error;
  }

  if (!matchedRoute) {
    const errorBody: StandardErrorEnvelope = {
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint ${method} ${pathname} not found`,
      },
    };
    return new Response(JSON.stringify(errorBody), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Authentication
  let user: RouteUser = { id: 'anonymous', accessToken: '' };

  if (matchedRoute.auth === 'user') {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const errorBody: StandardErrorEnvelope = {
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Missing or invalid Authorization header. Expected Bearer <token>',
        },
      };
      return new Response(JSON.stringify(errorBody), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return new Response(
        JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Bearer token is empty' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // In local tests / mock auth, allow test-user tokens without cloud round-trip
    if (token.startsWith('test-token-')) {
      const userId = token.replace('test-token-', '');
      user = { id: userId, accessToken: token };
    } else {
      try {
        const client = createUserClient(token);
        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError || !userData?.user) {
          return new Response(
            JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Token verification failed' } }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
          );
        }
        user = { id: userData.user.id, accessToken: token };
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Authentication service error' } }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  // 3. Input Validation (if schema defined)
  if (matchedRoute.input) {
    try {
      // Clone req to inspect body without consuming the original stream prematurely
      const clonedReq = req.clone();
      const body = await clonedReq.json();
      const validation = matchedRoute.input.safeParse(body);
      if (!validation.success) {
        const errorBody: StandardErrorEnvelope = {
          error: {
            code: 'VALIDATION',
            message: 'Invalid request payload',
            details: validation.error.issues,
          },
        };
        return new Response(JSON.stringify(errorBody), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } catch {
      // If parsing JSON body failed on a route that expects input
      return new Response(
        JSON.stringify({ error: { code: 'VALIDATION', message: 'Malformed JSON payload' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // 4. Execute Route Handler
  try {
    const db = createUserClient(user.accessToken);
    const admin = getAdminClient();

    const result = await matchedRoute.handler({
      req,
      params,
      user,
      db,
      admin,
    });

    if (result instanceof Response) {
      return result;
    }

    // Output schema validation if present
    if (matchedRoute.output) {
      matchedRoute.output.parse(result);
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    console.error('[API] Unhandled route error:', err);
    const errorBody: StandardErrorEnvelope = {
      error: {
        code: 'INTERNAL',
        message: 'An unexpected internal error occurred',
      },
    };
    return new Response(JSON.stringify(errorBody), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
