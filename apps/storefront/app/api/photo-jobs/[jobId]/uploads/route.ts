import { type NextRequest } from "next/server"
import { proxyUploadMutation } from "../../upload-proxy"

type Context = { params: Promise<{ jobId: string }> }
export async function POST(request: NextRequest, { params }: Context) {
  const { jobId } = await params
  return proxyUploadMutation(request, `/store/photo-jobs/${encodeURIComponent(jobId)}/uploads`)
}

