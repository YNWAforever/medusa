import React from "react"
import type { Locale } from "@fotomax/shared"
import type { EditorState } from "./editor-state"
import { effectiveSettings } from "./editor-state"
import { PhotoTile } from "./photo-tile"

export function PhotoGrid({ locale, state, visibleAssetIds, onSelect, onInspect }: { locale: Locale; state: EditorState; visibleAssetIds: string[]; onSelect(assetId: string, shiftKey: boolean): void; onInspect(assetId: string): void }) {
  return <section className="photo-grid" aria-label={locale === "zh-HK" ? "相片清單" : "Photo list"}>
    {visibleAssetIds.map((id) => <PhotoTile key={id} jobId={state.jobId} locale={locale} asset={state.assets[id]} settings={effectiveSettings(state, id)} selected={state.selectedAssetIds.includes(id)} readOnly={state.readOnly} onSelect={onSelect} onInspect={onInspect} />)}
  </section>
}