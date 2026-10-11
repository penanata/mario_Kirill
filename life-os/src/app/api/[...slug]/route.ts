import { dispatch } from "@/lib/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request, context: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await context.params;
  return dispatch(req, slug);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
