import { type NextRequest } from "next/server"
import { proxyUploadMutation } from "../../../../upload-proxy"

type Context = { params: Promise<{ jobId: string; sessionId: string }> }
export async function POST(request: NextRequest, { params }: Context) {
  const { jobId, sessionId } = await params
  return proxyUploadMutation(request, `/store/photo-jobs/${encodeURIComponent(jobId)}/uploads/${encodeURIComponent(sessionId)}/complete`)
}
