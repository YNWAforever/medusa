import { NextRequest, NextResponse } from "next/server"
import { parseFulfillmentInput } from "../../../../src/lib/medusa/checkout"
import { errorResponse, getContext, parseLocale } from "../shared"

export async function POST(request: NextRequest) {
  const fallbackLocale = request.nextUrl.searchParams.get("locale") === "zh-HK" ? "zh-HK" : "en"
  try {
    const locale = parseLocale(request)
    const input = parseFulfillmentInput(await request.json())
    const context = await getContext(request, locale)
    const checkout = await context.adapter.getCheckout(context.cartId, locale, context.branches)
    return NextResponse.json({ result: await context.adapter.setFulfillment(context.cartId, input, checkout.shippingOptions) }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && error.message === "invalid_checkout_input")) {
      return NextResponse.json({ error: { code: "invalid_checkout_input" } }, { status: 400 })
    }
    return errorResponse(error, fallbackLocale)
  }
}
