import { NextRequest, NextResponse } from "next/server"
import { proxyPhotoCartMutation } from "../../../../../src/lib/photo/cart-bff"

type Context = { params: Promise<{ jobId: string }> }

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { jobId } = await params
  return proxyPhotoCartMutation(request, jobId, "POST")
}

export async function DELETE(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { jobId } = await params
  return proxyPhotoCartMutation(request, jobId, "DELETE")
}
