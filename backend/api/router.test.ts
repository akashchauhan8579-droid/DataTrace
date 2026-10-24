import { describe, it, expect } from 'vitest';
import { route } from './router';
import type { RouteDef } from './types';
import { z } from 'zod';

describe('Master API Router (Member B - Spec v1.4 §7.5, §16)', () => {
  describe('Liveness Health Endpoint (§16)', () => {
    it('serves GET /health without authentication', async () => {
      const req = new Request('http://localhost:3000/api/health', {
        method: 'GET',
      });

      const res = await route(req, ['health']);
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.status).toBe('ok');
      expect(body.version).toBe('1.4.0');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('Route Matching & 404 Handling', () => {
    it('returns 404 NOT_FOUND for unknown routes with standard error envelope', async () => {
      const req = new Request('http://localhost:3000/api/unknown/endpoint', {
        method: 'GET',
      });

      const res = await route(req, ['unknown', 'endpoint']);
      expect(res.status).toBe(404);

      const body = (await res.json()) as any;
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe('NOT_FOUND');
      expect(body.error.message).toContain('GET /unknown/endpoint not found');
    });

    it('extracts URL path parameters correctly', async () => {
      const customRoute: RouteDef = {
        method: 'GET',
        pattern: '/cases/:caseId/items/:itemId',
        auth: 'none',
        handler: async ({ params }) => {
          return { caseId: params.caseId, itemId: params.itemId };
        },
      };

      const req = new Request('http://localhost:3000/api/cases/c-123/items/i-456', {
        method: 'GET',
      });

      const res = await route(req, ['cases', 'c-123', 'items', 'i-456'], [customRoute]);
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.caseId).toBe('c-123');
      expect(body.itemId).toBe('i-456');
    });
  });

  describe('Authentication Gate (§7.5, §15.1)', () => {
    it('rejects protected routes when Authorization header is missing', async () => {
      const req = new Request('http://localhost:3000/api/cases', {
        method: 'GET',
      });

      const res = await route(req, ['cases']);
      expect(res.status).toBe(401);

      const body = (await res.json()) as any;
      expect(body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects malformed Bearer tokens', async () => {
      const req = new Request('http://localhost:3000/api/cases', {
        method: 'GET',
        headers: {
          Authorization: 'Basic invalid-format',
        },
      });

      const res = await route(req, ['cases']);
      expect(res.status).toBe(401);
      const body = (await res.json()) as any;
      expect(body.error.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('Input Validation & Error Envelope (§7.5)', () => {
    it('returns 400 VALIDATION with details when payload fails Zod schema', async () => {
      const customRoute: RouteDef = {
        method: 'POST',
        pattern: '/test-validation',
        auth: 'none',
        input: z.object({
          email: z.string().email(),
          count: z.number().min(1),
        }),
        handler: async () => ({ success: true }),
      };

      const req = new Request('http://localhost:3000/api/test-validation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', count: 0 }),
      });

      const res = await route(req, ['test-validation'], [customRoute]);
      expect(res.status).toBe(400);

      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
      expect(body.error.details).toBeInstanceOf(Array);
      expect(body.error.details.length).toBeGreaterThanOrEqual(2);
    });

    it('returns 400 VALIDATION on malformed JSON body', async () => {
      const customRoute: RouteDef = {
        method: 'POST',
        pattern: '/test-json',
        auth: 'none',
        input: z.object({ ok: z.boolean() }),
        handler: async () => ({ success: true }),
      };

      const req = new Request('http://localhost:3000/api/test-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid-json-{',
      });

      const res = await route(req, ['test-json'], [customRoute]);
      expect(res.status).toBe(400);

      const body = (await res.json()) as any;
      expect(body.error.code).toBe('VALIDATION');
    });
  });
});
