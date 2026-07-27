import { describe, expect, it } from "vitest"
import {
  createPhotoGuestCookie,
  isAllowedPhotoMutationOrigin,
  PHOTO_GUEST_COOKIE,
  photoGuestCookieOptions,
  photoJobResponse,
  photoRequestHeaders,
} from "./ownership"

describe("photo-job BFF ownership containment", () => {
  it("sets a seven-day HttpOnly same-site guest secret outside JSON", async () => {
    const secret = "gqVvUs6_vDW0BsZO8B0Kjt6fKLsWbX8WGkzev2TI17Y"
    const cookie = createPhotoGuestCookie(secret)
    const response = photoJobResponse({ photo_job: { id: "phjob_123" } }, secret)

    expect(PHOTO_GUEST_COOKIE).toBe("fm_photo_guest")
    expect(photoGuestCookieOptions).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    })
    expect(cookie).toEqual({ name: PHOTO_GUEST_COOKIE, value: secret, options: photoGuestCookieOptions })
    expect(JSON.stringify(await response.json())).not.toContain(secret)
    expect(response.headers.get("set-cookie")).toContain(`${PHOTO_GUEST_COOKIE}=`)
  })

  it("forwards the guest secret only in the private Medusa header", () => {
    const secret = "gqVvUs6_vDW0BsZO8B0Kjt6fKLsWbX8WGkzev2TI17Y"

    expect(photoRequestHeaders({ guestSecret: secret })).toEqual({
      "x-fotomax-guest-token": secret,
    })
    expect(photoRequestHeaders({ customerToken: "jwt_customer" })).toEqual({
      authorization: "Bearer jwt_customer",
    })
    expect(photoRequestHeaders({ customerToken: "jwt_customer", guestSecret: secret, includeGuestWithCustomer: true })).toEqual({
      authorization: "Bearer jwt_customer",
      "x-fotomax-guest-token": secret,
    })
  })

  it("rejects mutation origins that differ from the configured storefront origin", () => {
    const origin = "https://www.fotomax.example"

    expect(isAllowedPhotoMutationOrigin(new Headers({ origin }), origin)).toBe(true)
    expect(isAllowedPhotoMutationOrigin(new Headers({ origin: "https://attacker.example" }), origin)).toBe(false)
    expect(isAllowedPhotoMutationOrigin(new Headers(), origin)).toBe(false)
  })
})
