import { getSymbols } from "@/lib/ticko/client";

// Server-only: this client talks to the Ticko API and must never
// end up in browser bundles.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Internal verification route for the public Ticko `getSymbols()` client.
 *
 * `GET /api/ticko/symbols` proxies the Ticko market symbols request so the
 * client can be exercised end-to-end until a real UI is built.
 */
export async function GET() {
  try {
    const data = await getSymbols();
    return Response.json({ ok: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
}