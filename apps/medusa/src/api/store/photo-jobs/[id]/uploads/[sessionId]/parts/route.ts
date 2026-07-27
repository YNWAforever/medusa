import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createMedusaUploadOperations, handleSignPart } from "../../handlers"

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const operations = createMedusaUploadOperations(req as never)
  await handleSignPart(req as never, res, operations)
}
