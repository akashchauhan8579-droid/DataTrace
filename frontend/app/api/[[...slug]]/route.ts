import { route } from '../../../../backend/api/router';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handler(
  req: Request,
  ctx: { params: Promise<{ slug?: string[] }> | { slug?: string[] } }
): Promise<Response> {
  const resolved = await ctx.params;
  const slug = resolved?.slug || [];
  return route(req, slug);
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
