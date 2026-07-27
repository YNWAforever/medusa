import { useEffect, useMemo, useState } from "react"
import { Button, Heading, Input, Select, Text } from "@medusajs/ui"

type Job = { id: string; status: string; production_status?: string | null; updated_at?: string; media_expires_at?: string | null }
type Asset = { id: string; display_name?: string; status: string; failure_class?: string | null; width?: number | null; height?: number | null }
type Detail = { photo_job: Job; assets: Asset[]; items: Array<Record<string, any>>; version: Record<string, any> | null; audits: Array<Record<string, any>> }

const statuses = ["accepted", "processing", "ready", "in_production", "ready_for_pickup", "shipped", "fulfilled", "failed", "cancelled"]
const reasons = ["quality_check", "production", "support"]

async function jsonFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...init?.headers } })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.code ?? `request_${response.status}`)
  return payload
}

export function PhotoProductionOperations() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [manifest, setManifest] = useState<Record<string, any> | null>(null)
  const [accessAsset, setAccessAsset] = useState<Asset | null>(null)
  const [accessReason, setAccessReason] = useState("production")
  const [accessUrl, setAccessUrl] = useState("")
  const [message, setMessage] = useState("")

  const loadJobs = async () => {
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set("q", query.trim())
      if (filter !== "all") params.set("production_status", filter)
      const payload = await jsonFetch(`/admin/photo-jobs?${params}`)
      setJobs(payload.photo_jobs)
      setMessage("")
    } catch (error) { setMessage((error as Error).message) }
  }
  const loadDetail = async (id: string) => {
    setSelected(id)
    setManifest(null)
    try { setDetail(await jsonFetch(`/admin/photo-jobs/${id}`)); setMessage("") }
    catch (error) { setMessage((error as Error).message) }
  }

  useEffect(() => { void loadJobs() }, [filter])
const visibleJobs = useMemo(() => jobs.filter((job) => job.id.toLowerCase().includes(query.trim().toLowerCase())), [jobs, query])

  const changeStatus = async (status: string) => {
    if (!selected) return
    try {
      await jsonFetch(`/admin/photo-jobs/${selected}/status`, { method: "POST", body: JSON.stringify({ status }) })
      await Promise.all([loadJobs(), loadDetail(selected)])
    } catch (error) { setMessage((error as Error).message) }
  }
  const retry = async (assetId: string) => {
    if (!selected) return
    try { await jsonFetch(`/admin/photo-jobs/${selected}/retry`, { method: "POST", body: JSON.stringify({ assetId }) }); await loadDetail(selected) }
    catch (error) { setMessage((error as Error).message) }
  }
  const requestAccess = async () => {
    if (!selected || !accessAsset) return
    try {
      const payload = await jsonFetch(`/admin/photo-jobs/${selected}/assets/${accessAsset.id}/access`, { method: "POST", body: JSON.stringify({ reason: accessReason }) })
      window.open(payload.access.url, "_blank", "noopener,noreferrer")
      setAccessAsset(null)
      await loadDetail(selected)
    } catch (error) { setMessage((error as Error).message) }
  }

  return <div className="flex h-full min-h-0 flex-col bg-ui-bg-base">
    <header className="border-b border-ui-border-base px-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><Heading level="h1">Photo production</Heading><Text size="small" className="text-ui-fg-subtle">Ordered jobs, processing state, and audited source access</Text></div>
        <a href="/app/photo-production/branches" className="text-ui-fg-interactive text-sm">Branch capabilities</a>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Input aria-label="Search job ID" placeholder="Search job ID" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadJobs() }} className="max-w-xs" />
        <Select value={filter} onValueChange={setFilter}><Select.Trigger className="w-52"><Select.Value /></Select.Trigger><Select.Content><Select.Item value="all">All production states</Select.Item>{statuses.map((status) => <Select.Item key={status} value={status}>{status.replaceAll("_", " ")}</Select.Item>)}</Select.Content></Select>
        <Button variant="secondary" onClick={() => void loadJobs()}>Search</Button>
      </div>
      {message && <Text size="small" className="mt-2 text-ui-fg-error">{message}</Text>}
    </header>

    <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(520px,1fr)_minmax(420px,0.8fr)]">
      <div className="overflow-auto border-r border-ui-border-base">
        <table className="w-full text-left text-sm"><thead className="sticky top-0 bg-ui-bg-subtle"><tr><th className="px-4 py-2">Job</th><th className="px-4 py-2">Commerce</th><th className="px-4 py-2">Production</th><th className="px-4 py-2">Updated</th></tr></thead><tbody>{visibleJobs.map((job) => <tr key={job.id} className={` border-t border-ui-border-base hover:bg-ui-bg-subtle ${selected === job.id ? "bg-ui-bg-subtle" : ""}`}><td className="px-4 py-3 font-mono text-xs"><button type="button" className="text-ui-fg-interactive hover:underline" onClick={() => void loadDetail(job.id)}>{job.id}</button></td><td className="px-4 py-3">{job.status}</td><td className="px-4 py-3">{job.production_status ?? "accepted"}</td><td className="px-4 py-3 text-ui-fg-subtle">{job.updated_at ? new Date(job.updated_at).toLocaleString() : ""}</td></tr>)}</tbody></table>
      </div>

      <aside className="overflow-auto px-5 py-4">
        {!detail ? <Text className="text-ui-fg-subtle">Select a production job.</Text> : <div className="space-y-6">
          <section><div className="flex items-start justify-between gap-3"><div><Heading level="h2">{detail.photo_job.id}</Heading><Text size="small" className="text-ui-fg-subtle">{detail.version?.order_id ?? "No order reference"}</Text></div><Select value={detail.photo_job.production_status ?? "accepted"} onValueChange={(value) => void changeStatus(value)}><Select.Trigger className="w-44"><Select.Value /></Select.Trigger><Select.Content>{statuses.map((status) => <Select.Item key={status} value={status}>{status.replaceAll("_", " ")}</Select.Item>)}</Select.Content></Select></div></section>
          <section><div className="mb-2 flex items-center justify-between"><Heading level="h3">Production manifest</Heading><Button variant="secondary" size="small" onClick={async () => { try { const payload = await jsonFetch(`/admin/photo-jobs/${selected}/manifest`); setManifest(payload.manifest) } catch (error) { setMessage((error as Error).message) } }}>Load manifest</Button></div>{manifest && <div className="overflow-x-auto border-y border-ui-border-base"><pre className="p-3 text-xs whitespace-pre-wrap">{JSON.stringify(manifest, null, 2)}</pre></div>}</section>
          <section><Heading level="h3">Assets</Heading><div className="mt-2 divide-y divide-ui-border-base border-y border-ui-border-base">{detail.assets.map((asset) => <div key={asset.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><div className="truncate text-sm font-medium">{asset.display_name ?? asset.id}</div><div className="text-xs text-ui-fg-subtle">{asset.status} {asset.width && asset.height ? `· ${asset.width} x ${asset.height}` : ""}</div></div><div className="flex shrink-0 gap-2">{asset.failure_class === "dead_letter" && <Button size="small" variant="secondary" onClick={() => void retry(asset.id)}>Retry</Button>}<Button size="small" variant="secondary" onClick={() => { setAccessUrl(""); setAccessAsset(asset) }}>Access original</Button></div></div>)}</div></section>
          <section><Heading level="h3">Access and status audit</Heading><div className="mt-2 divide-y divide-ui-border-base border-y border-ui-border-base">{detail.audits.map((audit) => <div key={audit.id} className="py-2 text-xs"><span className="font-medium">{audit.action}</span> | {audit.reason} | {audit.actor_id}</div>)}</div></section>
        </div>}
      </aside>
    </div>

    {accessAsset && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="access-title"><div className="w-full max-w-md rounded bg-ui-bg-base p-5 shadow-elevation-modal"><Heading id="access-title" level="h2">Access original</Heading><Text size="small" className="mt-1 text-ui-fg-subtle">This request is audited and the link expires within five minutes.</Text><label className="mt-4 block text-sm font-medium">Reason</label><Select value={accessReason} onValueChange={setAccessReason}><Select.Trigger className="mt-1 w-full"><Select.Value /></Select.Trigger><Select.Content>{reasons.map((reason) => <Select.Item key={reason} value={reason}>{reason.replaceAll("_", " ")}</Select.Item>)}</Select.Content></Select><div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={() => { setAccessUrl(""); setAccessAsset(null) }}>Cancel</Button>{accessUrl ? <a className="inline-flex h-8 items-center rounded bg-ui-button-inverted px-3 text-sm text-ui-fg-on-inverted" href={accessUrl} target="_blank" rel="noopener noreferrer">Open original</a> : <Button onClick={() => void requestAccess()}>Request access</Button>}</div></div></div>}
  </div>
}
