import type { PhotoAssetView, PhotoJobView, PhotoWarningView } from "../../lib/photo/contracts"
import type { PhotoSettings } from "../../lib/photo/settings"

export const AUTOSAVE_DELAY_MS = 750
const DEFAULT_SETTINGS: PhotoSettings = { finish: "glossy", border: "none", cropMode: "fill", crop: { x: 0, y: 0, width: 1, height: 1 }, quantity: 1 }

export type AutosaveStatus = "idle" | "saving" | "saved" | "conflict" | "error"
export type EditorState = {
  jobId: string
  revision: number
  assets: Record<string, PhotoAssetView>
  assetOrder: string[]
  selectedAssetIds: string[]
  selectionAnchor: string | null
  defaults: PhotoSettings
  overrides: Record<string, Partial<PhotoSettings>>
  acknowledgements: Record<string, string[]>
  changeSequence: number
  dirty: boolean
  autosaveStatus: AutosaveStatus
  readOnly: boolean
}

type EditorAction =
  | { type: "select"; assetId: string; shiftKey?: boolean }
  | { type: "select-compatible" }
  | { type: "select-warning" }
  | { type: "set-batch"; patch: Partial<PhotoSettings> }
  | { type: "set-asset"; assetId: string; patch: Partial<PhotoSettings> }
  | { type: "reset-asset"; assetId: string }
  | { type: "ack-warning"; assetId: string; code: string; acknowledged: boolean }
  | { type: "save-start" }
  | { type: "save-success"; revision: number; savedSequence: number }
  | { type: "save-error"; savedSequence: number }
  | { type: "save-conflict" }
  | { type: "retry-save" }
  | { type: "refresh-assets"; job: PhotoJobView }
  | { type: "reload"; job: PhotoJobView }

export function photoWarningCode(warning: PhotoWarningView): string {
  return typeof warning === "string" ? warning : warning.code
}
function warningAcknowledged(warning: PhotoWarningView): boolean {
  return typeof warning === "string" ? false : warning.acknowledged === true
}
function isReady(asset: PhotoAssetView): boolean { return asset.status === "ready" }

export function createEditorState(job: PhotoJobView): EditorState {
  const visibleAssets = (job.assets ?? []).filter((asset) => asset.status !== "deleted")
  const defaults = job.active_version?.defaults ?? DEFAULT_SETTINGS
  const versionItems = new Map((job.active_version?.items ?? []).map((item) => [item.asset_id, item]))
  const overrides = Object.fromEntries(visibleAssets.flatMap((asset) => {
    const item = versionItems.get(asset.id)
    if (!item) return []
    return [[asset.id, { finish: item.finish, border: item.border, cropMode: item.crop_mode, crop: item.crop, quantity: item.quantity }]]
  }))
  return {
    jobId: job.id,
    revision: job.revision,
    assets: Object.fromEntries(visibleAssets.map((asset) => [asset.id, asset])),
    assetOrder: visibleAssets.map((asset) => asset.id),
    selectedAssetIds: [],
    selectionAnchor: null,
    defaults: { ...defaults, crop: { ...defaults.crop } },
    overrides,
    acknowledgements: Object.fromEntries(visibleAssets.map((asset) => {
      const serverWarnings = (asset.warnings ?? []).filter(warningAcknowledged).map(photoWarningCode)
      const savedCodes = versionItems.get(asset.id)?.warning_acknowledgements ?? []
      return [asset.id, [...new Set([...serverWarnings, ...savedCodes])]]
    })),
    changeSequence: 0,
    dirty: false,
    autosaveStatus: "idle",
    readOnly: ["ordered", "completed", "cancelled", "expired"].includes(job.status),
  }
}

export function effectiveSettings(state: EditorState, assetId: string): PhotoSettings {
  const override = state.overrides[assetId] ?? {}
  return { ...state.defaults, ...override, crop: { ...state.defaults.crop, ...(override.crop ?? {}) } }
}

function changedAutosaveStatus(state: EditorState): AutosaveStatus {
  return state.autosaveStatus === "saving" ? "saving" : "idle"
}

function applyPatch(state: EditorState, assetId: string, patch: Partial<PhotoSettings>): EditorState {
  return { ...state, overrides: { ...state.overrides, [assetId]: { ...state.overrides[assetId], ...patch } }, changeSequence: state.changeSequence + 1, dirty: true, autosaveStatus: changedAutosaveStatus(state) }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (state.readOnly && ["set-batch", "set-asset", "reset-asset", "ack-warning"].includes(action.type)) return state
  switch (action.type) {
    case "select": {
      if (!state.assets[action.assetId]) return state
      if (action.shiftKey && state.selectionAnchor) {
        const start = state.assetOrder.indexOf(state.selectionAnchor)
        const end = state.assetOrder.indexOf(action.assetId)
        if (start >= 0 && end >= 0) {
          const range = state.assetOrder.slice(Math.min(start, end), Math.max(start, end) + 1)
          return { ...state, selectedAssetIds: [...new Set([...state.selectedAssetIds, ...range])] }
        }
      }
      const selected = state.selectedAssetIds.includes(action.assetId)
        ? state.selectedAssetIds.filter((id) => id !== action.assetId)
        : [...state.selectedAssetIds, action.assetId]
      return { ...state, selectedAssetIds: selected, selectionAnchor: action.assetId }
    }
    case "select-compatible": return { ...state, selectedAssetIds: state.assetOrder.filter((id) => isReady(state.assets[id])) }
    case "select-warning": return { ...state, selectedAssetIds: state.assetOrder.filter((id) => (state.assets[id].warnings ?? []).some((warning) => !warningAcknowledged(warning) && !(state.acknowledgements[id] ?? []).includes(photoWarningCode(warning)))) }
    case "set-batch": {
      if (!state.selectedAssetIds.length) return state
      const compatible = state.assetOrder.filter((id) => isReady(state.assets[id]))
      const appliesToAll = compatible.length > 0 && compatible.every((id) => state.selectedAssetIds.includes(id))
      if (appliesToAll) {
        const overrides = { ...state.overrides }
        for (const id of state.selectedAssetIds) {
          if (!overrides[id]) continue
          const next = { ...overrides[id] }
          for (const key of Object.keys(action.patch) as Array<keyof PhotoSettings>) delete next[key]
          if (Object.keys(next).length) overrides[id] = next
          else delete overrides[id]
        }
        return { ...state, defaults: { ...state.defaults, ...action.patch }, overrides, changeSequence: state.changeSequence + 1, dirty: true, autosaveStatus: changedAutosaveStatus(state) }
      }
      return state.selectedAssetIds.reduce((next, id) => applyPatch(next, id, action.patch), state)
    }
    case "set-asset": return state.assets[action.assetId] ? applyPatch(state, action.assetId, action.patch) : state
    case "reset-asset": {
      const overrides = { ...state.overrides }
      delete overrides[action.assetId]
      return { ...state, overrides, changeSequence: state.changeSequence + 1, dirty: true, autosaveStatus: changedAutosaveStatus(state) }
    }
    case "ack-warning": {
      const current = new Set(state.acknowledgements[action.assetId] ?? [])
      action.acknowledged ? current.add(action.code) : current.delete(action.code)
      return { ...state, acknowledgements: { ...state.acknowledgements, [action.assetId]: [...current].sort() }, changeSequence: state.changeSequence + 1, dirty: true, autosaveStatus: changedAutosaveStatus(state) }
    }
    case "refresh-assets": {
      const visibleAssets = (action.job.assets ?? []).filter((asset) => asset.status !== "deleted")
      const assets = Object.fromEntries(visibleAssets.map((asset) => [asset.id, asset]))
      const assetOrder = visibleAssets.map((asset) => asset.id)
      const acknowledgements = Object.fromEntries(visibleAssets.map((asset) => {
        const serverCodes = (asset.warnings ?? []).filter(warningAcknowledged).map(photoWarningCode)
        return [asset.id, [...new Set([...(state.acknowledgements[asset.id] ?? []), ...serverCodes])]]
      }))
      return {
        ...state,
        assets,
        assetOrder,
        selectedAssetIds: state.selectedAssetIds.filter((id) => id in assets),
        selectionAnchor: state.selectionAnchor && state.selectionAnchor in assets ? state.selectionAnchor : null,
        acknowledgements,
        readOnly: ["ordered", "completed", "cancelled", "expired"].includes(action.job.status),
      }
    }
    case "save-start": return { ...state, autosaveStatus: "saving" }
    case "save-success": {
      const hasNewerChanges = state.changeSequence !== action.savedSequence
      return { ...state, revision: action.revision, dirty: hasNewerChanges, autosaveStatus: hasNewerChanges ? "idle" : "saved" }
    }
    case "save-error": return state.changeSequence === action.savedSequence
      ? { ...state, autosaveStatus: "error" }
      : { ...state, dirty: true, autosaveStatus: "idle" }
    case "save-conflict": return { ...state, autosaveStatus: "conflict" }
    case "retry-save": return state.dirty ? { ...state, autosaveStatus: "idle" } : state
    case "reload": return createEditorState(action.job)
  }
}

export function buildVersionPayload(state: EditorState) {
  return {
    expectedRevision: state.revision,
    defaults: state.defaults,
    overrides: Object.entries(state.overrides).map(([assetId, settings]) => ({ assetId, settings })),
    warningAcknowledgements: Object.entries(state.acknowledgements).flatMap(([assetId, codes]) => codes.map((code) => ({ assetId, code }))).sort((left, right) => left.assetId.localeCompare(right.assetId) || left.code.localeCompare(right.code)),
  }
}

export function previewCropStyle(crop: PhotoSettings["crop"], rotation = 0, zoom = 1) {
  return { width: `${100 / crop.width}%`, height: `${100 / crop.height}%`, left: `${-(crop.x / crop.width) * 100}%`, top: `${-(crop.y / crop.height) * 100}%`, transform: `rotate(${rotation}deg) scale(${zoom})` }
}

export function assetProgressPhase(asset: PhotoAssetView): "uploading" | "uploaded" | "processing" | "ready" | "failed" {
  if (asset.status === "ready") return "ready"
  if (asset.status === "processing") return "processing"
  if (asset.status === "uploaded") return "uploaded"
  if (["failed", "blocked"].includes(asset.status)) return "failed"
  return "uploading"
}

export function createAutosaveScheduler<T>(save: (value: T) => void) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  return {
    schedule(value: T) { if (timeout) clearTimeout(timeout); timeout = setTimeout(() => save(value), AUTOSAVE_DELAY_MS) },
    cancel() { if (timeout) clearTimeout(timeout); timeout = undefined },
  }
}