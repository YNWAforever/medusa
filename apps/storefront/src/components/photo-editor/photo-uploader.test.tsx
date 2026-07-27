import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { PhotoUploader } from "./photo-uploader"

describe("PhotoUploader", () => {
  it("renders the English picker and semantic aggregate progress", () => {
    const html = renderToStaticMarkup(<PhotoUploader jobId="job_1" locale="en" />)
    expect(html).toContain("Add photos")
    expect(html).toContain("Overall upload progress")
    expect(html).toContain('type="file"')
    expect(html).toContain("multiple")
  })

  it("renders Traditional Chinese copy and restored uploaded placeholders", () => {
    const html = renderToStaticMarkup(<PhotoUploader jobId="job_1" locale="zh-HK" assets={[{ id: "a", display_name: "旅行.jpg", expected_bytes: 2048, status: "uploaded" }]} />)
    expect(html).toContain("加入相片")
    expect(html).toContain("已上載")
    expect(html).toContain("旅行.jpg")
  })
})
