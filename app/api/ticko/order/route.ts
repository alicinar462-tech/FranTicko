import { getOrder } from "@/lib/ticko/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const address = process.env.TICKO_ACCOUNT_ADDRESS?.trim().toLowerCase();

  if (!address) {
    return Response.json(
      {
        ok: false,
        error: "TICKO_ACCOUNT_ADDRESS is not configured.",
      },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);

  const order_id = searchParams.get("order_id") ?? undefined;
  const client_order_id = searchParams.get("client_order_id") ?? undefined;

  if (!order_id && !client_order_id) {
    return Response.json(
      {
        ok: false,
        error: "Provide order_id or client_order_id.",
      },
      { status: 400 },
    );
  }

  try {
    const data = await getOrder({
      address,
      order_id,
      client_order_id,
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