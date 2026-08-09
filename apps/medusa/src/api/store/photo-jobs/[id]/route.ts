import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  createMedusaPhotoJobOperations,
  handleStorePhotoJobDelete,
  handleStorePhotoJobGet,
} from "../route"

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  await handleStorePhotoJobGet(req, res, createMedusaPhotoJobOperations)
}

export async function DELETE(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  await handleStorePhotoJobDelete(req, res, createMedusaPhotoJobOperations)
}
