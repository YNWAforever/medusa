import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createMedusaVersionDependencies } from "../../version-dependencies"
import { asPhotoVersionRouteError, handleQuoteVersion } from "../../version-handlers"

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  try {
    await handleQuoteVersion(req as never, res, createMedusaVersionDependencies(req))
  } catch (error) {
    throw asPhotoVersionRouteError(error)
  }
}
