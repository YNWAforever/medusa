import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createMedusaUploadOperations, handleComplete } from "../../handlers"
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  await handleComplete(req as never, res, createMedusaUploadOperations(req as never))
}
