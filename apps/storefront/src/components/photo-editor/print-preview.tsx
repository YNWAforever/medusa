import React from "react"
import type { PhotoAssetView } from "../../lib/photo/contracts"
import type { PhotoSettings } from "../../lib/photo/settings"
import { previewCropStyle } from "./editor-state"

export function PrintPreview({ jobId, asset, settings, large = false }: { jobId: string; asset: PhotoAssetView; settings: PhotoSettings; large?: boolean }) {
  const src = `/api/photo-jobs/${encodeURIComponent(jobId)}/assets/${encodeURIComponent(asset.id)}/preview`
  return <div className={`print-preview ${large ? "large" : ""} ${settings.cropMode}`} data-border={settings.border}>
    {asset.status === "ready" ? <img src={src} alt="" style={settings.cropMode === "fill" ? previewCropStyle(settings.crop) : undefined} /> : <span aria-hidden="true" className="print-preview-placeholder" />}
  </div>
}