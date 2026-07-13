import { NextRequest, NextResponse } from "next/server"
import { parseContactInput } from "../../../../src/lib/medusa/checkout"
import { errorResponse, getContext } from "../shared"

export async function POST(request: NextRequest) {
  try {
    const input = parseContactInput(await request.json())
    const context = await getContext(request, "en")
    return NextResponse.json({ cart: await context.adapter.updateContact(context.cartId, input) }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message === "invalid_checkout_input")) {
      return NextResponse.json({ error: { code: "invalid_checkout_input" } }, { status: 400 })
    }
    return errorResponse(error, "en")
  }
}
