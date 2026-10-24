import { z } from 'zod';
import type { RouteDef } from '../types';

export const CreateCaseInputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
}).strict();

export const CaseOutputSchema = z.object({
  id: z.string().uuid(),
  displayId: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED', 'CLOSED']),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const ListCasesOutputSchema = z.object({
  cases: z.array(CaseOutputSchema),
});

export const casesRoutes: RouteDef[] = [
  // List user cases
  {
    method: 'GET',
    pattern: '/cases',
    auth: 'user',
    output: ListCasesOutputSchema,
    handler: async ({ user, db }) => {
      const { data, error } = await db
        .from('cases')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Database error listing cases: ${error.message}`);
      }

      return {
        cases: (data || []).map(c => ({
          id: c.id,
          displayId: c.display_id,
          title: c.title,
          description: c.description,
          status: c.status,
          createdAt: new Date(c.created_at).toISOString(),
          updatedAt: new Date(c.updated_at).toISOString(),
        })),
      };
    },
  },

  // Create new case
  {
    method: 'POST',
    pattern: '/cases',
    auth: 'user',
    input: CreateCaseInputSchema,
    output: CaseOutputSchema,
    handler: async ({ user, admin, req }) => {
      const body = await req.json();
      const validated = CreateCaseInputSchema.parse(body);

      // Writes use admin client with explicit owner_id
      const { data, error } = await admin
        .from('cases')
        .insert({
          owner_id: user.id,
          title: validated.title,
          description: validated.description,
          status: 'ACTIVE',
        })
        .select()
        .single();

      if (error || !data) {
        throw new Error(`Database error creating case: ${error?.message}`);
      }

      // Audit event
      await admin.from('audit_events').insert({
        case_id: data.id,
        actor_type: 'USER',
        actor_id: user.id,
        entity_type: 'CASE',
        entity_id: data.id,
        action: 'CASE_CREATED',
        metadata: { title: data.title },
      });

      return {
        id: data.id,
        displayId: data.display_id,
        title: data.title,
        description: data.description,
        status: data.status,
        createdAt: new Date(data.created_at).toISOString(),
        updatedAt: new Date(data.updated_at).toISOString(),
      };
    },
  },

  // Get single case
  {
    method: 'GET',
    pattern: '/cases/:id',
    auth: 'user',
    output: CaseOutputSchema,
    handler: async ({ user, db, params }) => {
      const { data, error } = await db
        .from('cases')
        .select('*')
        .eq('id', params.id)
        .eq('owner_id', user.id)
        .single();

      if (error || !data) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'NOT_FOUND',
              message: `Case ${params.id} not found`,
            },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return {
        id: data.id,
        displayId: data.display_id,
        title: data.title,
        description: data.description,
        status: data.status,
        createdAt: new Date(data.created_at).toISOString(),
        updatedAt: new Date(data.updated_at).toISOString(),
      };
    },
  },

  // Archive case
  {
    method: 'POST',
    pattern: '/cases/:id/archive',
    auth: 'user',
    handler: async ({ user, admin, db, params }) => {
      // Check ownership
      const { data: existing } = await db
        .from('cases')
        .select('id')
        .eq('id', params.id)
        .eq('owner_id', user.id)
        .single();

      if (!existing) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: `Case ${params.id} not found` } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      await admin.from('cases').update({ status: 'ARCHIVED' }).eq('id', params.id);
      await admin.from('audit_events').insert({
        case_id: params.id,
        actor_type: 'USER',
        actor_id: user.id,
        entity_type: 'CASE',
        entity_id: params.id,
        action: 'CASE_ARCHIVED',
        metadata: {},
      });

      return { success: true, status: 'ARCHIVED' };
    },
  },
];
