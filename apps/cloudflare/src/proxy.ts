export interface ContainerStub {
  fetch(request: Request): Promise<Response>
}

export const ADMIN_GATE_HEADER = "x-fotomax-admin-gate"

const adminPathPrefixes = ["/app", "/admin", "/auth/user"] as const

export function isAdminPath(pathname: string): boolean {
  return adminPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false
  }

  let mismatch = 0
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }

  return mismatch === 0
}

/**
 * Deny the Medusa Admin dashboard, the admin API, and the admin login endpoint
 * unless the caller presents the shared gate secret.
 *
 * Returns an opaque 404 rather than 403 so the Worker never advertises that an
 * admin surface exists. When the secret is unset the gate stays fully closed for
 * admin paths only — store traffic keeps flowing, because a missing admin secret
 * must not take the storefront down.
 */
export function denyAdminRequest(
  request: Request,
  expectedSecret: string | undefined,
): Response | null {
  if (!isAdminPath(new URL(request.url).pathname)) {
    return null
  }

  const expected = expectedSecret?.trim()
  const presented = request.headers.get(ADMIN_GATE_HEADER)?.trim()

  if (expected && presented && constantTimeEquals(presented, expected)) {
    return null
  }

  return new Response(null, {
    status: 404,
    headers: { "cache-control": "no-store" },
  })
}

export type ResolveContainer = () => ContainerStub

export interface ProxyLogEvent {
  request_id: string
  method: string
  pathname: string
  status: number
  duration_ms: number
}

export async function proxyToMedusa(
  request: Request,
  resolveContainer: ResolveContainer,
  createRequestId: () => string = () => crypto.randomUUID(),
  logEvent: (event: ProxyLogEvent) => void = (event) =>
    console.log("medusa_proxy_request", event),
  now: () => number = () => Date.now(),
): Promise<Response> {
  const requestId = request.headers.get("x-request-id")?.trim() || createRequestId()
  const startedAt = now()
  const requestUrl = new URL(request.url)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-request-id", requestId)

  try {
    const response = await resolveContainer().fetch(
      new Request(request, { headers: requestHeaders }),
    )
    const responseHeaders = new Headers(response.headers)
    responseHeaders.set("x-request-id", requestId)
    logEvent({
      request_id: requestId,
      method: request.method,
      pathname: requestUrl.pathname,
      status: response.status,
      duration_ms: now() - startedAt,
    })

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch {
    logEvent({
      request_id: requestId,
      method: request.method,
      pathname: requestUrl.pathname,
      status: 503,
      duration_ms: now() - startedAt,
    })
    return Response.json(
      { code: "MEDUSA_UNAVAILABLE", request_id: requestId },
      {
        status: 503,
        headers: {
          "cache-control": "no-store",
          "x-request-id": requestId,
        },
      },
    )
  }
}
