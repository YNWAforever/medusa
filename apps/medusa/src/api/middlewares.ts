import { authenticate, defineMiddlewares } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

const PHOTO_MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

function origin(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

export function enforcePhotoOrigin(req: any, _res: any, next: () => void): void {
  if (!PHOTO_MUTATION_METHODS.has(String(req.method ?? "").toUpperCase())) {
    next()
    return
  }
  const requestOrigin = origin(req.headers?.origin ?? req.headers?.get?.("origin"))
  if (!requestOrigin) {
    next()
    return
  }
  const allowed = new Set(
    String(process.env.STORE_CORS ?? "")
      .split(",")
      .flatMap((value) => {
        const parsed = origin(value)
        return parsed ? [parsed] : []
      }),
  )
  if (!allowed.has(requestOrigin)) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "photo_origin_forbidden",
    )
  }
  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/photo-jobs*",
      middlewares: [
        enforcePhotoOrigin,
        authenticate("customer", "bearer", { allowUnauthenticated: true }),
      ],
    },
  ],
})