import { NextRequest, NextResponse } from "next/server"
import { errorResponse, getContext } from "../shared"

export async function POST(request: NextRequest) {
  try {
    const context = await getContext(request, "en")
    return NextResponse.json({ payment: await context.adapter.initializePayment(context.cartId) }, { headers: { "cache-control": "no-store" } })
  } catch (error) {
    return errorResponse(error, "en")
  }
}
