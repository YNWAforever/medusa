import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

import { CUSTOMER_TOKEN_COOKIE } from "./lib/medusa/session"
import { PHOTO_GUEST_COOKIE } from "./lib/photo/ownership"
import { GET, POST } from "../app/api/photo-jobs/route"

const guestSecret = "gqVvUs6_vDW0BsZO8B0Kjt6fKLsWbX8WGkzev2TI17Y"

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest("https://storefront.test" + path, init)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  process.env.MEDUSA_BACKEND_URL = "https://medusa.test"
  process.env.MEDUSA_PUBLISHABLE_KEY = "pk_test"
  process.env.STOREFRONT_SESSION_SECRET = "test-secret"
  process.env.STOREFRONT_ORIGIN = "https://storefront.test"
  vi.restoreAllMocks()
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ photo_job: { id: "phjob_123" } })))
})

describe("photo-job BFF routes", () => {
  it("refreshes an existing guest cookie after guest-owned list activity without rotating it", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ photo_jobs: [] }))

    const response = await GET(request("/api/photo-jobs", {
      headers: { cookie: `${PHOTO_GUEST_COOKIE}=${guestSecret}` },
    }))

    expect(response.status).toBe(200)
    expect(response.cookies.get(PHOTO_GUEST_COOKIE)?.value).toBe(guestSecret)
    expect(fetch).toHaveBeenCalledWith("https://medusa.test/store/photo-jobs", expect.objectContaining({
      headers: expect.objectContaining({
        "x-fotomax-guest-token": guestSecret,
      }),
    }))
  })

  it("does not refresh the guest cookie when authenticated customer ownership is active", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ photo_jobs: [] }))

    const response = await GET(request("/api/photo-jobs", {
      headers: { cookie: `${PHOTO_GUEST_COOKIE}=${guestSecret}; ${CUSTOMER_TOKEN_COOKIE}=jwt_customer` },
    }))

    expect(response.status).toBe(200)
    expect(response.cookies.get(PHOTO_GUEST_COOKIE)).toBeUndefined()
    expect(fetch).toHaveBeenCalledWith("https://medusa.test/store/photo-jobs", expect.objectContaining({
      headers: expect.not.objectContaining({
        "x-fotomax-guest-token": guestSecret,
      }),
    }))
  })

  it("returns 400 for malformed POST JSON before contacting Medusa", async () => {
    const response = await POST(request("/api/photo-jobs", {
      method: "POST",
      body: "{",
      headers: {
        "content-type": "application/json",
        origin: "https://storefront.test",
      },
    }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: { code: "invalid_photo_job_input" } })
    expect(fetch).not.toHaveBeenCalled()
  })
})
