import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createMedusaUploadOperations, handleAbort } from "../../handlers"
export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  await handleAbort(req as never, res, createMedusaUploadOperations(req as never))
}
