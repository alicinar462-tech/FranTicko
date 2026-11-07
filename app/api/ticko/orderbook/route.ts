
import { getOrderBook } from "@/lib/ticko/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const symbolId = Number(searchParams.get("symbol_id") ?? "20001");
  const level = Number(searchParams.get("level") ?? "1");

  if (!Number.isInteger(symbolId) || symbolId <= 0) {
    return Response.json(
      {
        ok: false,
        error: "Invalid symbol_id.",
      },
      { status: 400 },
    );
  }

  if (!Number.isInteger(level) || level <= 0) {
    return Response.json(
      {
        ok: false,
        error: "Invalid level.",
      },
      { status: 400 },
    );
  }

  try {
    const data = await getOrderBook(symbolId, { level });

    return Response.json({
      ok: true,
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json(
      {
        ok: false,
        error: message,
      },
      { status: 502 },
    );
  }
}
