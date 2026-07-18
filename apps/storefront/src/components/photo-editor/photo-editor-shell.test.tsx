import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PhotoEditorShell } from "./photo-editor-shell"

describe("PhotoEditorShell", () => {
  it("renders a localized inaccessible-job state", () => {
    expect(renderToStaticMarkup(<PhotoEditorShell jobId="missing" locale="en" initialJob={null} />)).toContain("This photo workspace is unavailable.")
    expect(renderToStaticMarkup(<PhotoEditorShell jobId="missing" locale="zh-HK" initialJob={null} />)).toContain("無法使用此相片工作區。")
  })
})
