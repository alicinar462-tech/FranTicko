
import { isAddress } from "viem";
import { getOrders } from "@/lib/ticko/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const rawAddress = process.env.TICKO_ACCOUNT_ADDRESS?.trim();

  if (!rawAddress) {
    return Response.json(
      {
        ok: false,
        error: "Ticko account address is not configured.",
      },
      { status: 500 },
    );
  }

  if (!isAddress(rawAddress, { strict: false })) {
    return Response.json(
      {
        ok: false,
        error: "Configured Ticko account address is invalid.",
      },
      { status: 500 },
    );
  }

  const address = rawAddress.toLowerCase();

  const symbolIdParam = searchParams.get("symbol_id");
  const limitParam = searchParams.get("limit");

  const symbol_id = symbolIdParam ? Number(symbolIdParam) : undefined;
  const limit = limitParam ? Number(limitParam) : undefined;

  if (
    symbol_id !== undefined &&
    (!Number.isInteger(symbol_id) || symbol_id <= 0)
  ) {
    return Response.json(
      { ok: false, error: "Invalid symbol_id." },
      { status: 400 },
    );
  }

  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || limit <= 0)
  ) {
    return Response.json(
      { ok: false, error: "Invalid limit." },
      { status: 400 },
    );
  }

  try {
    const data = await getOrders({
      address,
      symbol_id,
      order_filter: searchParams.get("order_filter") ?? undefined,
      limit,
      cursor: searchParams.get("cursor") ?? undefined,
    });

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
