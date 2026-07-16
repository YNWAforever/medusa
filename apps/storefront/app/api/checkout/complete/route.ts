import { NextRequest, NextResponse } from "next/server"
import { sealOrderConfirmation, ORDER_CONFIRMATION_COOKIE, orderConfirmationCookieOptions } from "../../../../src/lib/confirmation-cookie"
import { errorResponse, getContext, clearCart, parseLocale } from "../shared"

export async function POST(request: NextRequest) {
  const fallbackLocale = request.nextUrl.searchParams.get("locale") === "zh-HK" ? "zh-HK" : "en"
  try {
    const locale = parseLocale(request)
    const context = await getContext(request, locale)
    const validated = await context.adapter.validate(context.cartId, locale, context.branches)
    await context.adapter.initializePayment(context.cartId)
    const confirmation = await context.adapter.complete(context.cartId, validated.fulfillment.kind, validated.cart.email ?? "")
    const response = clearCart(NextResponse.json({ confirmation }))
    response.cookies.set(ORDER_CONFIRMATION_COOKIE, sealOrderConfirmation(confirmation), orderConfirmationCookieOptions)
    return response
  } catch (error) {
    return errorResponse(error, fallbackLocale)
  }
}
