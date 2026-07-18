import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("server-only", () => ({}))

import { CUSTOMER_TOKEN_COOKIE } from "./lib/medusa/session"
import { PHOTO_GUEST_COOKIE, validPhotoGuestSecret } from "./lib/photo/ownership"
import { GET, POST } from "../app/api/photo-jobs/route"
import { GET as GET_DETAIL } from "../app/api/photo-jobs/[jobId]/route"
import { POST as CLAIM } from "../app/api/photo-jobs/[jobId]/claim/route"

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

  it("does not forward an invalid guest cookie on GET", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ photo_jobs: [] }))

    const response = await GET(request("/api/photo-jobs", {
      headers: { cookie: `${PHOTO_GUEST_COOKIE}=malformed` },
    }))

    expect(response.status).toBe(200)
    expect(response.cookies.get(PHOTO_GUEST_COOKIE)).toBeUndefined()
    expect(fetch).toHaveBeenCalledWith("https://medusa.test/store/photo-jobs", expect.objectContaining({
      headers: expect.not.objectContaining({
        "x-fotomax-guest-token": "malformed",
      }),
    }))
  })

  it("replaces an invalid guest cookie with one stable valid secret on POST", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ photo_job: { id: "phjob_123" } }))

    const response = await POST(request("/api/photo-jobs", {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "application/json",
        cookie: `${PHOTO_GUEST_COOKIE}=malformed`,
        origin: "https://storefront.test",
      },
    }))

    const replacement = response.cookies.get(PHOTO_GUEST_COOKIE)?.value
    const forwardedHeaders = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers)

    expect(response.status).toBe(200)
    expect(replacement).toBeDefined()
    expect(validPhotoGuestSecret(replacement)).toBe(true)
    expect(forwardedHeaders.get("x-fotomax-guest-token")).toBe(replacement)
    expect(forwardedHeaders.get("x-fotomax-guest-token")).not.toBe("malformed")
    expect(response.headers.get("set-cookie")).toContain("HttpOnly")
    expect(JSON.stringify(await response.clone().json())).not.toContain(replacement)
  })

  it("does not rotate a valid guest cookie on POST", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ photo_job: { id: "phjob_123" } }))

    const response = await POST(request("/api/photo-jobs", {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "application/json",
        cookie: `${PHOTO_GUEST_COOKIE}=${guestSecret}`,
        origin: "https://storefront.test",
      },
    }))

    const forwardedHeaders = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers)

    expect(response.status).toBe(200)
    expect(forwardedHeaders.get("x-fotomax-guest-token")).toBe(guestSecret)
    expect(response.cookies.get(PHOTO_GUEST_COOKIE)?.value).toBe(guestSecret)
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

  it("refreshes a valid guest cookie after successful detail activity", async () => {
    const response = await GET_DETAIL(request("/api/photo-jobs/phjob_123", {
      headers: { cookie: `${PHOTO_GUEST_COOKIE}=${guestSecret}` },
    }), { params: Promise.resolve({ jobId: "phjob_123" }) })

    expect(response.status).toBe(200)
    expect(response.cookies.get(PHOTO_GUEST_COOKIE)?.value).toBe(guestSecret)
    expect(fetch).toHaveBeenCalledWith(
      "https://medusa.test/store/photo-jobs/phjob_123",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-fotomax-guest-token": guestSecret }),
      }),
    )
  })

  it("does not forward or refresh a malformed guest cookie on detail GET", async () => {
    const response = await GET_DETAIL(request("/api/photo-jobs/phjob_123", {
      headers: { cookie: `${PHOTO_GUEST_COOKIE}=malformed` },
    }), { params: Promise.resolve({ jobId: "phjob_123" }) })
    const forwardedHeaders = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers)

    expect(response.status).toBe(200)
    expect(forwardedHeaders.get("x-fotomax-guest-token")).toBeNull()
    expect(response.cookies.get(PHOTO_GUEST_COOKIE)).toBeUndefined()
  })

  it("does not refresh a guest cookie for a failed detail response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: { code: "photo_job_not_found" } }, 404))

    const response = await GET_DETAIL(request("/api/photo-jobs/phjob_123", {
      headers: { cookie: `${PHOTO_GUEST_COOKIE}=${guestSecret}` },
    }), { params: Promise.resolve({ jobId: "phjob_123" }) })

    expect(response.status).toBe(404)
    expect(response.cookies.get(PHOTO_GUEST_COOKIE)).toBeUndefined()
  })

  it("does not forward a malformed guest cookie on claim", async () => {
    const response = await CLAIM(request("/api/photo-jobs/phjob_123/claim", {
      method: "POST",
      headers: {
        cookie: `${PHOTO_GUEST_COOKIE}=malformed; ${CUSTOMER_TOKEN_COOKIE}=jwt_customer`,
        origin: "https://storefront.test",
        "if-match": "4",
      },
    }), { params: Promise.resolve({ jobId: "phjob_123" }) })
    const forwardedHeaders = new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers)

    expect(response.status).toBe(200)
    expect(forwardedHeaders.get("authorization")).toBe("Bearer jwt_customer")
    expect(forwardedHeaders.get("x-fotomax-guest-token")).toBeNull()
  })
})
