import { type NextRequest } from "next/server"
import { proxyAssetDelete } from "../../../upload-proxy"
type Context = { params: Promise<{ jobId: string; assetId: string }> }
export async function DELETE(request: NextRequest, { params }: Context) { const { jobId, assetId } = await params; return proxyAssetDelete(request, `/store/photo-jobs/${encodeURIComponent(jobId)}/assets/${encodeURIComponent(assetId)}`) }
