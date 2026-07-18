"use client"

import React from "react"

import { ImagePlus, RefreshCw, Trash2, UploadCloud } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import type { Locale } from "@fotomax/shared"

import type { PhotoAssetView } from "../../lib/photo/contracts"
import { createPhotoClient } from "../../lib/photo/client"
import { MultipartUploader, restoreUploads, validateSelection } from "../../lib/photo/uploader"

type RowStatus = "queued" | "uploading" | "uploaded" | "failed"
type QueueRow = { id: string; name: string; bytes: number; status: RowStatus; progress: number; file?: File; error?: string }

const labels = {
  en: { add: "Add photos", heading: "Your photos", empty: "No photos added yet", uploaded: "Uploaded", uploading: "Uploading", queued: "Ready", failed: "Upload failed", retry: "Retry upload", remove: "Remove", total: "Overall upload progress" },
  "zh-HK": { add: "加入相片", heading: "你的相片", empty: "尚未加入相片", uploaded: "已上載", uploading: "上載中", queued: "準備上載", failed: "上載失敗", retry: "重新上載", remove: "移除", total: "整體上載進度" },
} as const

export function PhotoUploader({ jobId, locale, assets = [] }: { jobId: string; locale: Locale; assets?: PhotoAssetView[] }) {
  const copy = labels[locale]
  const uploader = useMemo(() => new MultipartUploader(createPhotoClient()), [])
  const [rows, setRows] = useState<QueueRow[]>(() => restoreUploads({ id: jobId, locale, revision: 0, status: "uploading", assets }).map((item) => ({ ...item, progress: item.status === "uploaded" ? 100 : 0 })))
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const retryRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const update = (id: string, patch: Partial<QueueRow>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))

  async function run(row: QueueRow) {
    if (!row.file) return
    update(row.id, { status: "uploading", error: undefined })
    try {
      await uploader.upload(jobId, row.file, row.id, (progress) => update(row.id, { progress: progress.percent }))
      update(row.id, { status: "uploaded", progress: 100 })
    } catch (error) {
      update(row.id, { status: "failed", error: error instanceof Error ? error.message : "photo_upload_failed" })
      requestAnimationFrame(() => retryRefs.current[row.id]?.focus())
    }
  }

  function select(files: FileList | null) {
    const selected = Array.from(files ?? [])
    if (!selected.length) return
    try { validateSelection(selected, assets) } catch (error) { setSelectionError(error instanceof Error ? error.message : "photo_upload_failed"); return }
    setSelectionError(null)
    const additions = selected.map((file) => ({ id: crypto.randomUUID(), name: file.name, bytes: file.size, status: "queued" as const, progress: 0, file }))
    setRows((current) => [...current, ...additions])
    additions.forEach((row) => void run(row))
  }

  const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0)
  const uploadedBytes = rows.reduce((sum, row) => sum + row.bytes * row.progress / 100, 0)
  const aggregate = totalBytes ? Math.round(uploadedBytes / totalBytes * 100) : 0

  return <section className="photo-uploader" aria-labelledby="photo-queue-heading">
    <div className="photo-uploader-toolbar">
      <div><p className="eyebrow">FotoMax</p><h2 id="photo-queue-heading">{copy.heading}</h2></div>
      <label className="button primary photo-picker"><ImagePlus aria-hidden="true" size={19} />{copy.add}<input type="file" accept="image/jpeg,image/png,image/heic,image/heif" multiple onChange={(event) => select(event.currentTarget.files)} /></label>
    </div>
    {selectionError ? <p className="photo-error" role="alert">{selectionError}</p> : null}
    <div className="photo-aggregate"><span>{copy.total}</span><strong>{aggregate}%</strong><progress value={aggregate} max={100}>{aggregate}%</progress></div>
    {rows.length ? <ul className="photo-queue">{rows.map((row) => {
      const status = copy[row.status]
      return <li className="photo-queue-row" key={row.id}>
        <UploadCloud aria-hidden="true" size={22} />
        <div className="photo-file"><strong>{row.name}</strong><span>{formatBytes(row.bytes)} · {status}</span></div>
        <progress aria-label={`${row.name}: ${status}`} value={row.progress} max={100}>{row.progress}%</progress>
        <span className="photo-percent" aria-live="polite">{row.progress}%</span>
        <div className="photo-row-actions">
          {row.status === "failed" ? <button className="icon-button" type="button" ref={(node) => { retryRefs.current[row.id] = node }} onClick={() => void run(row)} title={copy.retry}><RefreshCw aria-hidden="true" size={18} /><span className="sr-only">{copy.retry}</span></button> : null}
          {row.status !== "uploading" ? <button className="icon-button" type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} title={copy.remove}><Trash2 aria-hidden="true" size={18} /><span className="sr-only">{copy.remove}</span></button> : null}
        </div>
      </li>
    })}</ul> : <div className="photo-empty"><UploadCloud aria-hidden="true" size={30} /><p>{copy.empty}</p></div>}
  </section>
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
