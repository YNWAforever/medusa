import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createMedusaUploadOperations, handleCreateUpload } from "./handlers"
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  await handleCreateUpload(req as never, res, createMedusaUploadOperations(req as never))
}
