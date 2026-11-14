
import { getRefData } from "@/lib/ticko/client";

// Server-only: this client talks to the Ticko API and must never
// end up in browser bundles.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal verification route for the public Ticko getRefData() client.
 *
 * GET /api/ticko/ref-data proxies the Ticko market reference data request.
 */
export async function GET() {
  try {
    const data = await getRefData();
    return Response.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}
