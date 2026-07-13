import { NextRequest, NextResponse } from "next/server"
import { errorResponse, getContext, parseLocale } from "./shared"

export async function GET(request: NextRequest) {
  const fallbackLocale = request.nextUrl.searchParams.get("locale") === "zh-HK" ? "zh-HK" : "en"
  try {
    const locale = parseLocale(request)
    const context = await getContext(request, locale)
    return NextResponse.json({ checkout: await context.adapter.getCheckout(context.cartId, locale, context.branches) }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    return errorResponse(error, fallbackLocale)
  }
}
