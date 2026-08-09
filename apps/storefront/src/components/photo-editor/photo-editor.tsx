"use client"

import React, { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import type { Locale } from "@fotomax/shared"
import { AlertCircle } from "lucide-react"
import { useOptionalCart } from "../cart-provider"
import { createPhotoClient } from "../../lib/photo/client"
import { PhotoClientError, type PhotoJobView } from "../../lib/photo/contracts"
import { buildVersionPayload, createEditorState, editorReducer, photoWarningCode } from "./editor-state"
import { PhotoGrid } from "./photo-grid"
import { PhotoInspector } from "./photo-inspector"
import { PhotoToolbar } from "./photo-toolbar"
import { QuoteSummary } from "./quote-summary"
import type { QualityFilterValue } from "./quality-filter"

const copy = {
  en: { live: "Photo editor status", readOnly: "This photo job is read-only", conflict: "The photo job on the server was updated.", reload: "Reload latest version", saveError: "Changes could not be saved. Try again.", retry: "Retry save", quoteError: "A quote is not available right now." },
  "zh-HK": { live: "相片編輯狀態", readOnly: "此相片工作現為唯讀", conflict: "伺服器上的相片工作已更新", reload: "重新載入最新版本", saveError: "未能儲存變更，請再試一次。", retry: "重新儲存", quoteError: "暫時未能提供報價。" },
} as const

type Quote = { versionId: string; subtotal: number; currencyCode: string; quotedAt: string; quoteExpiresAt: string; manifestDigest: string; requiresReview?: boolean }

export function PhotoConflictNotice({ locale, onReload }: { locale: Locale; onReload(): void }) {
  return <div className="photo-conflict" role="alert"><AlertCircle aria-hidden="true" size={20} /><p>{copy[locale].conflict}</p><button type="button" className="button secondary" onClick={onReload}>{copy[locale].reload}</button></div>
}

export function PhotoEditor({ job, locale, onJobChange }: { job: PhotoJobView; locale: Locale; onJobChange?(job: PhotoJobView): void }) {
  const client = useMemo(() => createPhotoClient(), [])
  const cart = useOptionalCart()
  const [state, dispatch] = useReducer(editorReducer, job, createEditorState)
  const [inspectedId, setInspectedId] = useState(() => job.assets?.find((asset) => asset.status === "ready")?.id ?? job.assets?.[0]?.id ?? null)
  const [filter, setFilter] = useState<QualityFilterValue>("all")
  const [versionId, setVersionId] = useState<string | null>(job.active_version_id ?? null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [message, setMessage] = useState("")
  const allAssetsReady = state.assetOrder.length > 0 && state.assetOrder.every((id) => state.assets[id].status === "ready")

  const incomingAssetSignature = JSON.stringify(job.assets ?? [])
  const stateAssetSignature = JSON.stringify(state.assetOrder.map((id) => state.assets[id]))

  useEffect(() => {
    if (job.revision !== state.revision && !state.dirty && state.autosaveStatus !== "conflict") {
      dispatch({ type: "reload", job })
      return
    }
    if (incomingAssetSignature !== stateAssetSignature) dispatch({ type: "refresh-assets", job })
  }, [incomingAssetSignature, job, state.autosaveStatus, state.dirty, state.revision, stateAssetSignature])

  const saveVersion = useCallback(async () => {
    if (state.readOnly || !allAssetsReady) return versionId
    const savedSequence = state.changeSequence
    dispatch({ type: "save-start" })
    try {
      const result = await client.createVersion(state.jobId, buildVersionPayload(state))
      setVersionId(result.version.id)
      dispatch({ type: "save-success", revision: result.jobRevision, savedSequence })
      setMessage("")
      return result.version.id
    } catch (error) {
      if (error instanceof PhotoClientError && error.status === 409) dispatch({ type: "save-conflict" })
      else { dispatch({ type: "save-error", savedSequence }); setMessage(copy[locale].saveError) }
      return null
    }
  }, [allAssetsReady, client, locale, state, versionId])

  useEffect(() => {
    if (!state.dirty || state.autosaveStatus !== "idle" || state.readOnly) return
    const timer = setTimeout(() => { void saveVersion() }, 750)
    return () => clearTimeout(timer)
  }, [saveVersion, state.autosaveStatus, state.dirty, state.readOnly])

  const reload = useCallback(async () => {
    try {
      const latest = await client.getJob(state.jobId)
      dispatch({ type: "reload", job: latest })
      setVersionId(latest.active_version_id ?? null)
      setQuote(null)
      onJobChange?.(latest)
    } catch { setMessage(copy[locale].saveError) }
  }, [client, locale, onJobChange, state.jobId])

  const reviewQuote = useCallback(async () => {
    setQuoteLoading(true)
    setMessage("")
    try {
      const currentVersionId = state.dirty || !versionId ? await saveVersion() : versionId
      if (!currentVersionId) return
      setQuote(await client.quoteVersion(state.jobId, currentVersionId))
    } catch { setMessage(copy[locale].quoteError) }
    finally { setQuoteLoading(false) }
  }, [client, locale, saveVersion, state.dirty, state.jobId, versionId])

  const attachQuote = useCallback(async () => {
    if (!quote) return
    setAttaching(true)
    setMessage("")
    try {
      await client.attachToCart(state.jobId)
      await cart?.refresh()
      cart?.openCart()
    } catch {
      setMessage(copy[locale].quoteError)
    } finally {
      setAttaching(false)
    }
  }, [cart, client, locale, quote, state.jobId])
  const visibleAssetIds = state.assetOrder.filter((id) => {
    const asset = state.assets[id]
    if (filter === "all") return true
    if (filter === "ready") return asset.status === "ready"
    if (filter === "processing") return asset.status === "uploaded" || asset.status === "processing"
    return (asset.warnings ?? []).some((warning) => !(state.acknowledgements[id] ?? []).includes(photoWarningCode(warning)))
  })
  const inspected = inspectedId && state.assets[inspectedId] ? inspectedId : visibleAssetIds[0] ?? null

  return <section className="photo-editor-workspace">
    {state.readOnly ? <p className="photo-read-only" role="status">{copy[locale].readOnly}</p> : null}
    {state.autosaveStatus === "conflict" ? <PhotoConflictNotice locale={locale} onReload={() => void reload()} /> : null}
    <div className="sr-only" aria-live="polite" aria-label={copy[locale].live}>{state.autosaveStatus}{message ? `: ${message}` : ""}</div>
    <PhotoToolbar locale={locale} state={state} filter={filter} onFilter={setFilter} onPatch={(patch) => dispatch({ type: "set-batch", patch })} onSelectCompatible={() => dispatch({ type: "select-compatible" })} onSelectWarnings={() => dispatch({ type: "select-warning" })} />
    <div className="photo-editor-layout">
      <div className="photo-editor-grid-pane">
        <PhotoGrid locale={locale} state={state} visibleAssetIds={visibleAssetIds} onSelect={(assetId, shiftKey) => dispatch({ type: "select", assetId, shiftKey })} onInspect={setInspectedId} />
      </div>
      <PhotoInspector locale={locale} state={state} assetId={inspected} onPatch={(assetId, patch) => dispatch({ type: "set-asset", assetId, patch })} onReset={(assetId) => dispatch({ type: "reset-asset", assetId })} onAcknowledge={(assetId, code, acknowledged) => dispatch({ type: "ack-warning", assetId, code, acknowledged })} />
    </div>
    {message ? <div className="photo-error" role="alert"><p>{message}</p>{state.autosaveStatus === "error" ? <button type="button" className="button secondary" onClick={() => { setMessage(""); dispatch({ type: "retry-save" }) }}>{copy[locale].retry}</button> : null}</div> : null}
    <QuoteSummary locale={locale} quote={quote} loading={quoteLoading} attaching={attaching} disabled={state.readOnly || !allAssetsReady || ["conflict", "saving"].includes(state.autosaveStatus)} onReview={() => void reviewQuote()} onAttach={() => void attachQuote()} />
  </section>
}