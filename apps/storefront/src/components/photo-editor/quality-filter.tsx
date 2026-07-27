import React from "react"
import type { Locale } from "@fotomax/shared"

export type QualityFilterValue = "all" | "warning" | "processing" | "ready"
export function QualityFilter({ locale, value, onChange }: { locale: Locale; value: QualityFilterValue; onChange(value: QualityFilterValue): void }) {
  return <label className="quality-filter">
    <span>{locale === "zh-HK" ? "篩選" : "Filter"}</span>
    <select value={value} onChange={(event) => onChange(event.currentTarget.value as QualityFilterValue)}>
      <option value="all">{locale === "zh-HK" ? "所有相片" : "All photos"}</option>
      <option value="warning">{locale === "zh-HK" ? "有警告" : "Warnings"}</option>
      <option value="processing">{locale === "zh-HK" ? "處理中" : "Processing"}</option>
      <option value="ready">{locale === "zh-HK" ? "可沖印" : "Ready"}</option>
    </select>
  </label>
}