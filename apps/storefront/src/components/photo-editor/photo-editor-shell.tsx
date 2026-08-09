"use client"

import React, { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, LoaderCircle } from "lucide-react"
import type { Locale } from "@fotomax/shared"
import { createPhotoClient } from "../../lib/photo/client"
import type { PhotoJobView } from "../../lib/photo/contracts"
import { PhotoEditor } from "./photo-editor"
import { PhotoUploader } from "./photo-uploader"

const copy = {
  en: { title: "Photo workspace", intro: "Upload originals, then prepare the whole batch for print.", loading: "Loading photo workspace", missing: "This photo workspace is unavailable.", missingDetail: "It may have expired, or it belongs to another account.", back: "Return to 4R photo prints" },
  "zh-HK": { title: "相片工作區", intro: "上載原始相片，然後一次過設定整批沖印。", loading: "正在載入相片工作區", missing: "無法使用此相片工作區。", missingDetail: "工作區可能已過期，或屬於另一個帳戶。", back: "返回 4R 相片沖印" },
} as const

export function PhotoEditorShell({ jobId, locale, initialJob }: { jobId: string; locale: Locale; initialJob?: PhotoJobView | null }) {
  const text = copy[locale]
  const [job, setJob] = useState<PhotoJobView | null | undefined>(initialJob)
  const refresh = useCallback(() => createPhotoClient().getJob(jobId).then(setJob).catch(() => setJob(null)), [jobId])

  useEffect(() => { if (initialJob === undefined) void refresh() }, [initialJob, refresh])
  useEffect(() => {
    if (!job || !job.assets?.some((asset) => ["uploaded", "processing"].includes(asset.status))) return
    const timer = setInterval(() => { void refresh() }, 2500)
    return () => clearInterval(timer)
  }, [job, refresh])

  if (job === undefined) return <main className="page-shell photo-editor-state" aria-live="polite"><LoaderCircle className="photo-spinner" aria-hidden="true" /><p>{text.loading}</p></main>
  if (job === null) return <main className="page-shell photo-editor-state"><AlertCircle aria-hidden="true" /><h1>{text.missing}</h1><p>{text.missingDetail}</p><Link className="button primary" href={`/${locale}/products/classic-4r-photo-print?photoJob=unavailable`}>{text.back}</Link></main>

  return <main className="page-shell photo-editor-page">
    <header className="photo-editor-heading"><h1>{text.title}</h1><p>{text.intro}</p></header>
    <PhotoUploader jobId={jobId} locale={locale} assets={job.assets} onChanged={() => void refresh()} />
    {(job.assets ?? []).some((asset) => ["uploaded", "processing", "ready", "blocked"].includes(asset.status)) ? <PhotoEditor job={job} locale={locale} onJobChange={setJob} /> : null}
  </main>
}