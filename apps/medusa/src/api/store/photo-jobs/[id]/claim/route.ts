import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import {
  createMedusaPhotoJobOperations,
  handleStorePhotoJobClaimPost,
} from "../../route"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  await handleStorePhotoJobClaimPost(req, res, createMedusaPhotoJobOperations)
}
