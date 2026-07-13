export interface ContainerStub {
  fetch(request: Request): Promise<Response>
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
