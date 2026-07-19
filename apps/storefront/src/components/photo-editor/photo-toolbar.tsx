import React from "react"
import type { Locale } from "@fotomax/shared"
import { AlertTriangle, CheckSquare2 } from "lucide-react"
import type { PhotoSettings } from "../../lib/photo/settings"
import type { EditorState } from "./editor-state"
import { QualityFilter, type QualityFilterValue } from "./quality-filter"

export function PhotoToolbar({ locale, state, filter, onFilter, onPatch, onSelectCompatible, onSelectWarnings }: {
  locale: Locale
  state: EditorState
  filter: QualityFilterValue
  onFilter(value: QualityFilterValue): void
  onPatch(patch: Partial<PhotoSettings>): void
  onSelectCompatible(): void
  onSelectWarnings(): void
}) {
  const copy = locale === "zh-HK" ? { select: "選擇可沖印", warning: "選擇有警告", crop: "裁切模式", fill: "填滿", fit: "完整", finish: "相紙", glossy: "光面", matte: "啞面", border: "白邊", quantity: "數量" } : { select: "Select ready", warning: "Select warnings", crop: "Crop mode", fill: "Fill", fit: "Fit", finish: "Finish", glossy: "Glossy", matte: "Matte", border: "White border", quantity: "Quantity" }
  const disabled = state.readOnly
  return <div className="photo-toolbar" aria-label={locale === "zh-HK" ? "批次相片工具" : "Batch photo tools"}>
    <div className="photo-toolbar-selection">
      <button type="button" className="button subtle" onClick={onSelectCompatible}><CheckSquare2 size={17} aria-hidden="true" />{copy.select}</button>
      <button type="button" className="icon-button" onClick={onSelectWarnings} title={copy.warning}><AlertTriangle size={18} aria-hidden="true" /><span className="sr-only">{copy.warning}</span></button>
      <QualityFilter locale={locale} value={filter} onChange={onFilter} />
    </div>
    <div className="segmented-control" role="group" aria-label={copy.crop}>
      {(["fill", "fit"] as const).map((value) => <button type="button" key={value} aria-pressed={state.defaults.cropMode === value} disabled={disabled} onClick={() => onPatch({ cropMode: value })}>{value === "fill" ? copy.fill : copy.fit}</button>)}
    </div>
    <div className="segmented-control" role="group" aria-label={copy.finish}>
      {(["glossy", "matte"] as const).map((value) => <button type="button" key={value} aria-pressed={state.defaults.finish === value} disabled={disabled} onClick={() => onPatch({ finish: value })}>{value === "glossy" ? copy.glossy : copy.matte}</button>)}
    </div>
    <label className="photo-toolbar-check"><input type="checkbox" disabled={disabled} checked={state.defaults.border === "white"} onChange={(event) => onPatch({ border: event.currentTarget.checked ? "white" : "none" })} />{copy.border}</label>
    <label className="photo-toolbar-quantity"><span>{copy.quantity}</span><input type="number" min={1} max={99} disabled={disabled} value={state.defaults.quantity} onChange={(event) => onPatch({ quantity: Math.min(99, Math.max(1, event.currentTarget.valueAsNumber || 1)) })} /></label>
  </div>
}