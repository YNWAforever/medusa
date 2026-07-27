import { describe, expect, it } from "vitest"

import {
  MIN_ADMIN_PASSWORD_LENGTH,
  parseAdminCredentials,
} from "./create-admin"

const validPassword = "a".repeat(MIN_ADMIN_PASSWORD_LENGTH)

describe("parseAdminCredentials", () => {
  it("returns trimmed credentials", () => {
    expect(
      parseAdminCredentials({
        FOTOMAX_ADMIN_EMAIL: "  ops@fotomax.example  ",
        FOTOMAX_ADMIN_PASSWORD: validPassword,
      }),
    ).toEqual({ email: "ops@fotomax.example", password: validPassword })
  })

  it.each([undefined, "", "   "])("rejects the missing email %s", (email) => {
    expect(() =>
      parseAdminCredentials({
        FOTOMAX_ADMIN_EMAIL: email,
        FOTOMAX_ADMIN_PASSWORD: validPassword,
      }),
    ).toThrow("FOTOMAX_ADMIN_EMAIL")
  })

  it.each(["ops", "ops@fotomax", "ops @fotomax.example", "@fotomax.example"])(
    "rejects the malformed email %s",
    (email) => {
      expect(() =>
        parseAdminCredentials({
          FOTOMAX_ADMIN_EMAIL: email,
          FOTOMAX_ADMIN_PASSWORD: validPassword,
        }),
      ).toThrow("valid email address")
    },
  )

  it("rejects a password shorter than the minimum", () => {
    expect(() =>
      parseAdminCredentials({
        FOTOMAX_ADMIN_EMAIL: "ops@fotomax.example",
        FOTOMAX_ADMIN_PASSWORD: "a".repeat(MIN_ADMIN_PASSWORD_LENGTH - 1),
      }),
    ).toThrow(`at least ${MIN_ADMIN_PASSWORD_LENGTH} characters`)
  })

  it("rejects a whitespace-padded password that is too short once trimmed", () => {
    expect(() =>
      parseAdminCredentials({
        FOTOMAX_ADMIN_EMAIL: "ops@fotomax.example",
        FOTOMAX_ADMIN_PASSWORD: `  ${"a".repeat(4)}  `,
      }),
    ).toThrow("FOTOMAX_ADMIN_PASSWORD")
  })

  it("never includes the password in an error message", () => {
    const password = "short-secret"

    try {
      parseAdminCredentials({
        FOTOMAX_ADMIN_EMAIL: "not-an-email",
        FOTOMAX_ADMIN_PASSWORD: password,
      })
      expect.unreachable("expected invalid credentials to throw")
    } catch (error) {
      expect((error as Error).message).not.toContain(password)
    }
  })
})
