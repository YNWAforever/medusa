import { afterEach, describe, expect, it, vi } from "vitest"
import type { PhotoAssetView, PhotoJobView } from "../../lib/photo/contracts"
import {
  AUTOSAVE_DELAY_MS,
  assetProgressPhase,
  buildVersionPayload,
  createAutosaveScheduler,
  createEditorState,
  editorReducer,
  effectiveSettings,
  previewCropStyle,
} from "./editor-state"

const readyAsset = (id: string, overrides: Partial<PhotoAssetView> = {}): PhotoAssetView => ({
  id,
  display_name: `${id}.jpg`,
  expected_bytes: 1024,
  status: "ready",
  width: 1800,
  height: 1200,
  quality_band: "good",
  warnings: [],
  ...overrides,
})

const job = (overrides: Partial<PhotoJobView> = {}): PhotoJobView => ({
  id: "job_1",
  locale: "en",
  status: "ready",
  revision: 7,
  assets: [
    readyAsset("asset_1"),
    readyAsset("asset_2", {
      quality_band: "caution",
      warnings: [{ code: "quality_caution", acknowledged: false }],
    }),
    readyAsset("asset_3"),
  ],
  ...overrides,
})

afterEach(() => vi.useRealTimers())

describe("batch photo editor state", () => {
  it("selects every compatible ready photo without selecting processing photos", () => {
    const state = createEditorState(job({
      assets: [
        readyAsset("asset_1"),
        readyAsset("asset_2", { status: "processing" }),
        readyAsset("asset_3"),
      ],
    }))

    expect(editorReducer(state, { type: "select-compatible" }).selectedAssetIds)
      .toEqual(["asset_1", "asset_3"])
  })

  it("extends keyboard selection across an ordered shift range", () => {
    let state = createEditorState(job())
    state = editorReducer(state, { type: "select", assetId: "asset_1" })
    state = editorReducer(state, { type: "select", assetId: "asset_3", shiftKey: true })

    expect(state.selectedAssetIds).toEqual(["asset_1", "asset_2", "asset_3"])
  })

  it("selects only photos with unacknowledged warnings", () => {
    const state = editorReducer(createEditorState(job()), { type: "select-warning" })
    expect(state.selectedAssetIds).toEqual(["asset_2"])
  })

  it.each([
    ["finish", "matte"],
    ["border", "white"],
    ["cropMode", "fit"],
    ["quantity", 4],
  ] as const)("applies a batch %s change to the selected photos", (setting, value) => {
    let state = editorReducer(createEditorState(job()), { type: "select-compatible" })
    state = editorReducer(state, { type: "set-batch", patch: { [setting]: value } })

    expect(effectiveSettings(state, "asset_1")[setting]).toBe(value)
    expect(effectiveSettings(state, "asset_3")[setting]).toBe(value)
    expect(state.dirty).toBe(true)
  })

  it("restores defaults, effective item settings, and acknowledgements from the active version", () => {
    const state = createEditorState(job({
      active_version_id: "version_4",
      active_version: {
        id: "version_4",
        defaults: { finish: "matte", border: "white", cropMode: "fit", crop: { x: 0, y: 0, width: 1, height: 1 }, quantity: 2 },
        items: [{ asset_id: "asset_1", finish: "glossy", border: "white", crop_mode: "fill", crop: { x: 0.1, y: 0, width: 0.8, height: 1 }, quantity: 4, warning_acknowledgements: ["quality_caution"] }],
      },
    } as Partial<PhotoJobView>))

    expect(state.defaults).toMatchObject({ finish: "matte", border: "white", cropMode: "fit", quantity: 2 })
    expect(effectiveSettings(state, "asset_1")).toMatchObject({ finish: "glossy", cropMode: "fill", quantity: 4 })
    expect(state.acknowledgements.asset_1).toContain("quality_caution")
    expect(state.dirty).toBe(false)
  })

  it("makes apply-to-all replace matching per-photo overrides", () => {
    let state = editorReducer(createEditorState(job()), { type: "set-asset", assetId: "asset_1", patch: { finish: "matte", quantity: 8 } })
    state = editorReducer(state, { type: "select-compatible" })
    state = editorReducer(state, { type: "set-batch", patch: { finish: "glossy" } })

    expect(effectiveSettings(state, "asset_1")).toMatchObject({ finish: "glossy", quantity: 8 })
  })

  it("keeps a per-photo override separate from batch defaults", () => {
    const state = editorReducer(createEditorState(job()), {
      type: "set-asset",
      assetId: "asset_2",
      patch: { quantity: 6, finish: "matte" },
    })

    expect(effectiveSettings(state, "asset_2")).toMatchObject({ quantity: 6, finish: "matte" })
    expect(effectiveSettings(state, "asset_1")).toMatchObject({ quantity: 1, finish: "glossy" })
  })

  it("resets one photo to the current batch defaults", () => {
    let state = editorReducer(createEditorState(job()), {
      type: "set-asset",
      assetId: "asset_2",
      patch: { quantity: 6 },
    })
    state = editorReducer(state, { type: "reset-asset", assetId: "asset_2" })

    expect(state.overrides.asset_2).toBeUndefined()
    expect(effectiveSettings(state, "asset_2").quantity).toBe(1)
  })

  it("turns a normalized crop into a preview transform without touching the source", () => {
    const crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 }
    expect(previewCropStyle(crop, 90, 1.2)).toEqual({
      width: "200%",
      height: "125%",
      left: "-50%",
      top: "-12.5%",
      transform: "rotate(90deg) scale(1.2)",
    })
    expect(crop).toEqual({ x: 0.25, y: 0.1, width: 0.5, height: 0.8 })
  })

  it("records and removes a warning acknowledgement by asset and code", () => {
    let state = editorReducer(createEditorState(job()), {
      type: "ack-warning",
      assetId: "asset_2",
      code: "quality_caution",
      acknowledged: true,
    })
    expect(buildVersionPayload(state).warningAcknowledgements)
      .toEqual([{ assetId: "asset_2", code: "quality_caution" }])

    state = editorReducer(state, {
      type: "ack-warning",
      assetId: "asset_2",
      code: "quality_caution",
      acknowledged: false,
    })
    expect(buildVersionPayload(state).warningAcknowledgements).toEqual([])
  })

  it("debounces immutable autosave until 750 ms of stable edits", () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const scheduler = createAutosaveScheduler(save)
    scheduler.schedule("first")
    vi.advanceTimersByTime(500)
    scheduler.schedule("latest")
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 1)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith("latest")
    scheduler.cancel()
  })

  it("refreshes processed assets without discarding unsaved print settings", () => {
    let state = editorReducer(createEditorState(job({
      assets: [readyAsset("asset_1", { status: "processing" })],
    })), {
      type: "set-asset", assetId: "asset_1", patch: { quantity: 3 },
    })

    state = editorReducer(state, {
      type: "refresh-assets",
      job: job({ assets: [readyAsset("asset_1", { status: "ready", estimated_ppi: 310 })] }),
    })

    expect(state.assets.asset_1.status).toBe("ready")
    expect(state.assets.asset_1.estimated_ppi).toBe(310)
    expect(effectiveSettings(state, "asset_1").quantity).toBe(3)
    expect(state.dirty).toBe(true)
  })

  it("keeps autosave serialized while edits arrive during a request", () => {
    let state = editorReducer(createEditorState(job()), { type: "set-asset", assetId: "asset_1", patch: { quantity: 2 } })
    state = editorReducer(state, { type: "save-start" })
    state = editorReducer(state, { type: "set-asset", assetId: "asset_1", patch: { quantity: 3 } })
    expect(state.autosaveStatus).toBe("saving")
  })

  it("allows an explicit retry after a transient save error", () => {
    let state = editorReducer(createEditorState(job()), { type: "set-asset", assetId: "asset_1", patch: { quantity: 2 } })
    const savedSequence = state.changeSequence
    state = editorReducer(state, { type: "save-error", savedSequence })
    state = editorReducer(state, { type: "retry-save" })
    expect(state.autosaveStatus).toBe("idle")
    expect(state.dirty).toBe(true)
  })

  it("keeps newer edits dirty when an older autosave settles", () => {
    let state = editorReducer(createEditorState(job()), {
      type: "set-asset", assetId: "asset_1", patch: { quantity: 2 },
    })
    const savedSequence = state.changeSequence
    state = editorReducer(state, { type: "save-start" })
    state = editorReducer(state, {
      type: "set-asset", assetId: "asset_1", patch: { quantity: 3 },
    })
    state = editorReducer(state, { type: "save-success", revision: 2, savedSequence })

    expect(state.revision).toBe(2)
    expect(state.dirty).toBe(true)
    expect(state.autosaveStatus).toBe("idle")
    expect(effectiveSettings(state, "asset_1").quantity).toBe(3)
  })

  it("pauses dirty autosave on conflict and reloads accepted server uploads", () => {
    let state = editorReducer(createEditorState(job()), {
      type: "set-asset",
      assetId: "asset_1",
      patch: { quantity: 2 },
    })
    state = editorReducer(state, { type: "save-conflict" })
    expect(state.autosaveStatus).toBe("conflict")
    expect(state.dirty).toBe(true)

    state = editorReducer(state, {
      type: "reload",
      job: job({ revision: 8, assets: [...(job().assets ?? []), readyAsset("asset_4")] }),
    })
    expect(state.revision).toBe(8)
    expect(state.assetOrder).toContain("asset_4")
    expect(state.autosaveStatus).toBe("idle")
  })

  it.each(["completed", "expired"] as const)("makes %s jobs read-only", (status) => {
    expect(createEditorState(job({ status })).readOnly).toBe(true)
  })

  it("distinguishes upload completion from server-side processing progress", () => {
    expect(assetProgressPhase(readyAsset("upload", { status: "uploaded" }))).toBe("uploaded")
    expect(assetProgressPhase(readyAsset("processing", { status: "processing" }))).toBe("processing")
    expect(assetProgressPhase(readyAsset("ready"))).toBe("ready")
  })
})
