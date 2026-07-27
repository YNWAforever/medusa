import { describe, expect, it } from "vitest"
import PhotoProductionModuleService from "./service"

describe("photo version persistence", () => {
  it("registers generated CRUD for immutable versions and print items", () => {
    const service = new PhotoProductionModuleService({ baseRepository: {} } as never)

    expect(service.createPhotoJobVersions).toBeTypeOf("function")
    expect(service.listPhotoJobVersions).toBeTypeOf("function")
    expect(service.createPrintItems).toBeTypeOf("function")
    expect(service.listPrintItems).toBeTypeOf("function")
  })
})
