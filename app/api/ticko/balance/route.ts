import { getBalance } from "@/lib/ticko/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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

  try {
    const data = await getBalance(address);

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