import React from "react"
import type { Locale } from "@fotomax/shared"
import type { PhotoAssetView } from "../../lib/photo/contracts"
import type { PhotoSettings } from "../../lib/photo/settings"
import { assetProgressPhase } from "./editor-state"
import { PrintPreview } from "./print-preview"

const phaseCopy = {
  en: { uploading: "Uploading", uploaded: "Upload complete, waiting for processing", processing: "Processing preview", ready: "Ready to print", failed: "Needs attention" },
  "zh-HK": { uploading: "正在上載", uploaded: "上載完成，等待處理", processing: "正在處理預覽", ready: "可供沖印", failed: "需要處理" },
} as const

export function PhotoTile({ jobId, locale, asset, settings, selected, readOnly, onSelect, onInspect }: {
  jobId: string
  locale: Locale
  asset: PhotoAssetView
  settings: PhotoSettings
  selected: boolean
  readOnly: boolean
  onSelect(assetId: string, shiftKey: boolean): void
  onInspect(assetId: string): void
}) {
  const phase = assetProgressPhase(asset)
  return <article className={`photo-tile ${selected ? "selected" : ""}`} data-phase={phase}>
    <label className="photo-tile-select">
      <input type="checkbox" checked={selected} disabled={readOnly || asset.status !== "ready"} aria-label={`${locale === "zh-HK" ? "選擇" : "Select"} ${asset.display_name}`} onChange={(event) => onSelect(asset.id, (event.nativeEvent as MouseEvent).shiftKey)} />
    </label>
    <button type="button" className="photo-tile-preview" onClick={() => onInspect(asset.id)} aria-label={`${locale === "zh-HK" ? "檢視" : "Inspect"} ${asset.display_name}`}>
      <PrintPreview jobId={jobId} asset={asset} settings={settings} />
    </button>
    <div className="photo-tile-meta">
      <strong title={asset.display_name}>{asset.display_name}</strong>
      <span className={`photo-phase phase-${phase}`}>{phaseCopy[locale][phase]}</span>
      {asset.estimated_ppi ? <span>{asset.estimated_ppi} PPI</span> : null}
    </div>
  </article>
}