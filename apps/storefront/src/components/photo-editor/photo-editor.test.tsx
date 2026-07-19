import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { PhotoJobView } from "../../lib/photo/contracts"
import { PhotoConflictNotice, PhotoEditor } from "./photo-editor"

const job: PhotoJobView = {
  id: "job_1",
  locale: "en",
  status: "processing",
  revision: 3,
  assets: [
    {
      id: "asset_ready",
      display_name: "family.jpg",
      expected_bytes: 2048,
      status: "ready",
      width: 1800,
      height: 1200,
      quality_band: "caution",
      estimated_ppi: 220,
      warnings: [{ code: "quality_caution", acknowledged: false }],
    },
    {
      id: "asset_uploaded",
      display_name: "holiday.jpg",
      expected_bytes: 1024,
      status: "uploaded",
    },
    {
      id: "asset_processing",
      display_name: "portrait.jpg",
      expected_bytes: 1024,
      status: "processing",
    },
  ],
}

describe("PhotoEditor", () => {
  it("renders one integrated batch workspace with keyboard-native controls", () => {
    const markup = renderToStaticMarkup(<PhotoEditor job={job} locale="en" />)
    expect(markup).toContain('class="photo-editor-workspace"')
    expect(markup).toContain('aria-label="Select family.jpg"')
    expect(markup).toContain('role="group" aria-label="Crop mode"')
    expect(markup).toContain('type="checkbox"')
    expect(markup).toContain('type="number"')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain("Review quote")
  })

  it("uses only the same-origin preview route and labels processing separately", () => {
    const markup = renderToStaticMarkup(<PhotoEditor job={job} locale="en" />)
    expect(markup).toContain('/api/photo-jobs/job_1/assets/asset_ready/preview')
    expect(markup).not.toContain("object_key")
    expect(markup).not.toContain("preview_key")
    expect(markup).toContain("Upload complete, waiting for processing")
    expect(markup).toContain("Processing preview")
  })

  it("localizes the conflict recovery choice without discarding uploads", () => {
    const markup = renderToStaticMarkup(
      <PhotoConflictNotice locale="zh-HK" onReload={vi.fn()} />,
    )
    expect(markup).toContain("伺服器上的相片工作已更新")
    expect(markup).toContain("重新載入最新版本")
  })

  it.each(["completed", "expired"] as const)("renders %s workspaces read-only", (status) => {
    const markup = renderToStaticMarkup(<PhotoEditor job={{ ...job, status }} locale="en" />)
    expect(markup).toContain("This photo job is read-only")
    expect(markup).toContain("disabled")
  })
})
