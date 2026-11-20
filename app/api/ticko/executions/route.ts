
import { isAddress } from "viem";
import { getExecutions } from "@/lib/ticko/client";

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
  const startTimeParam = searchParams.get("start_time");
  const endTimeParam = searchParams.get("end_time");
  const limitParam = searchParams.get("limit");

  const symbol_id = symbolIdParam ? Number(symbolIdParam) : undefined;
  const start_time = startTimeParam ? Number(startTimeParam) : undefined;
  const end_time = endTimeParam ? Number(endTimeParam) : undefined;
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

  if (start_time !== undefined && !Number.isFinite(start_time)) {
    return Response.json(
      { ok: false, error: "Invalid start_time." },
      { status: 400 },
    );
  }

  if (end_time !== undefined && !Number.isFinite(end_time)) {
    return Response.json(
      { ok: false, error: "Invalid end_time." },
      { status: 400 },
    );
  }

  if (
    start_time !== undefined &&
    end_time !== undefined &&
    start_time > end_time
  ) {
    return Response.json(
      { ok: false, error: "start_time cannot exceed end_time." },
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
    const data = await getExecutions({
      address,
      symbol_id,
      order_id: searchParams.get("order_id") ?? undefined,
      start_time,
      end_time,
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
