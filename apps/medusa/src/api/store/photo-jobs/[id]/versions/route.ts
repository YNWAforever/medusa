import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createMedusaVersionDependencies } from "../../version-dependencies"
import { asPhotoVersionRouteError, handleCreateVersion } from "../../version-handlers"

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    await handleCreateVersion(req as never, res, createMedusaVersionDependencies(req))
  } catch (error) {
    throw asPhotoVersionRouteError(error)
  }
}
