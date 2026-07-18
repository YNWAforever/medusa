"use client"

import React from "react"

import { AlertCircle, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"
import type { Locale } from "@fotomax/shared"

import { createPhotoClient } from "../../lib/photo/client"
import type { PhotoJobView } from "../../lib/photo/contracts"
import { PhotoUploader } from "./photo-uploader"

const copy = {
  en: { title: "Photo workspace", intro: "Upload the original files you want FotoMax to print.", loading: "Loading photo workspace", missing: "This photo workspace is unavailable.", missingDetail: "It may have expired, or it belongs to another account." },
  "zh-HK": { title: "相片工作區", intro: "上載你想交由 FotoMax 沖印的原始相片。", loading: "正在載入相片工作區", missing: "無法使用此相片工作區。", missingDetail: "工作區可能已過期，或屬於另一個帳戶。" },
} as const

export function PhotoEditorShell({ jobId, locale, initialJob }: { jobId: string; locale: Locale; initialJob?: PhotoJobView | null }) {
  const text = copy[locale]
  const [job, setJob] = useState<PhotoJobView | null | undefined>(initialJob)
  useEffect(() => {
    if (initialJob !== undefined) return
    createPhotoClient().getJob(jobId).then(setJob).catch(() => setJob(null))
  }, [initialJob, jobId])

  if (job === undefined) return <main className="page-shell photo-editor-state" aria-live="polite"><LoaderCircle className="photo-spinner" aria-hidden="true" /><p>{text.loading}</p></main>
  if (job === null) return <main className="page-shell photo-editor-state"><AlertCircle aria-hidden="true" /><h1>{text.missing}</h1><p>{text.missingDetail}</p></main>

  return <main className="page-shell photo-editor-page">
    <header className="photo-editor-heading"><h1>{text.title}</h1><p>{text.intro}</p></header>
    <PhotoUploader jobId={jobId} locale={locale} assets={job.assets} />
  </main>
}
