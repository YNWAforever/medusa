import { NextRequest, NextResponse } from "next/server"
import { proxyPhotoVersionMutation } from "../../../../../src/lib/photo/version-bff"

type Context = { params: Promise<{ jobId: string }> }

export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { jobId } = await params
  return proxyPhotoVersionMutation(request, jobId, "quote")
}
