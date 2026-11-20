
import { isAddress } from "viem";
import { getBalance } from "@/lib/ticko/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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
