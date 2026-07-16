import { describe, expect, it } from "vitest"
import { CART_COOKIE, cartCookieOptions } from "./session"

describe("cart session", () => {
  it("uses the private thirty-day cart cookie contract", () => {
    expect(CART_COOKIE).toBe("fm_cart_id")
    expect(cartCookieOptions).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 2_592_000,
    })
  })
})
