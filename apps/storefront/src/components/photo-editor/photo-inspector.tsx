import React from "react"
import type { Locale } from "@fotomax/shared"
import { RotateCcw } from "lucide-react"
import type { PhotoSettings } from "../../lib/photo/settings"
import type { EditorState } from "./editor-state"
import { effectiveSettings, photoWarningCode } from "./editor-state"
import { PrintPreview } from "./print-preview"

export function PhotoInspector({ locale, state, assetId, onPatch, onReset, onAcknowledge }: {
  locale: Locale
  state: EditorState
  assetId: string | null
  onPatch(assetId: string, patch: Partial<PhotoSettings>): void
  onReset(assetId: string): void
  onAcknowledge(assetId: string, code: string, acknowledged: boolean): void
}) {
  const copy = locale === "zh-HK" ? { title: "相片設定", empty: "選擇一張相片以查看設定。", reset: "重設為批次設定", quantity: "數量", warnings: "沖印提示", acknowledge: "我已了解並接受此沖印提示" } : { title: "Photo settings", empty: "Select a photo to inspect its settings.", reset: "Reset to batch settings", quantity: "Quantity", warnings: "Print notices", acknowledge: "I understand and accept this print notice" }
  const asset = assetId ? state.assets[assetId] : undefined
  if (!asset) return <aside className="photo-inspector"><h2>{copy.title}</h2><p>{copy.empty}</p></aside>
  const settings = effectiveSettings(state, asset.id)
  return <aside className="photo-inspector" aria-labelledby="photo-inspector-heading">
    <div className="photo-inspector-heading"><div><p className="eyebrow">{copy.title}</p><h2 id="photo-inspector-heading">{asset.display_name}</h2></div><button type="button" className="icon-button" disabled={state.readOnly} title={copy.reset} onClick={() => onReset(asset.id)}><RotateCcw size={18} aria-hidden="true" /><span className="sr-only">{copy.reset}</span></button></div>
    <PrintPreview jobId={state.jobId} asset={asset} settings={settings} large />
    <label className="inspector-quantity"><span>{copy.quantity}</span><input type="number" min={1} max={99} disabled={state.readOnly || asset.status !== "ready"} value={settings.quantity} onChange={(event) => onPatch(asset.id, { quantity: Math.min(99, Math.max(1, event.currentTarget.valueAsNumber || 1)) })} /></label>
    {(asset.warnings ?? []).length ? <fieldset className="photo-warnings"><legend>{copy.warnings}</legend>{asset.warnings?.map((warning) => { const code = photoWarningCode(warning); const checked = (state.acknowledgements[asset.id] ?? []).includes(code); return <label key={code}><input type="checkbox" checked={checked} disabled={state.readOnly} onChange={(event) => onAcknowledge(asset.id, code, event.currentTarget.checked)} /><span><strong>{code.replaceAll("_", " ")}</strong>{copy.acknowledge}</span></label> })}</fieldset> : null}
  </aside>
}