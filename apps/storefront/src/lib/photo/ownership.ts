import { randomBytes } from "node:crypto"
import { NextResponse } from "next/server"

export const PHOTO_GUEST_COOKIE = "fm_photo_guest"
export const PHOTO_GUEST_TTL_SECONDS = 60 * 60 * 24 * 7

export const photoGuestCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: PHOTO_GUEST_TTL_SECONDS,
}

export function createPhotoGuestSecret(): string {
  return randomBytes(32).toString("base64url")
}

export function createPhotoGuestCookie(secret: string) {
  return {
    name: PHOTO_GUEST_COOKIE,
    value: secret,
    options: photoGuestCookieOptions,
  }
}

export function photoJobResponse(body: unknown, guestSecret?: string, status = 200): NextResponse {
  const response = NextResponse.json(body, { status })
  if (guestSecret) {
    const cookie = createPhotoGuestCookie(guestSecret)
    response.cookies.set(cookie.name, cookie.value, cookie.options)
  }
  return response
}

export interface PhotoRequestHeaderInput {
  customerToken?: string | null
  guestSecret?: string | null
  includeGuestWithCustomer?: boolean
  extra?: HeadersInit
}

export function photoRequestHeaders({
  customerToken,
  guestSecret,
  includeGuestWithCustomer = false,
  extra,
}: PhotoRequestHeaderInput): Record<string, string> {
  const headers: Record<string, string> = {}
  if (extra) {
    new Headers(extra).forEach((value, key) => {
      headers[key] = value
    })
  }

  if (customerToken) {
    headers.authorization = `Bearer ${customerToken}`
  }
  if (guestSecret && (!customerToken || includeGuestWithCustomer)) {
    headers["x-fotomax-guest-token"] = guestSecret
  }

  return headers
}

export function isAllowedPhotoMutationOrigin(
  headers: Pick<Headers, "get">,
  configuredOrigin: string,
): boolean {
  const origin = headers.get("origin")
  if (!origin || !configuredOrigin) {
    return false
  }

  try {
    return new URL(origin).origin === new URL(configuredOrigin).origin
  } catch {
    return false
  }
}

export function configuredStorefrontOrigin(requestOrigin: string): string {
  return process.env.STOREFRONT_ORIGIN?.trim()
    || process.env.NEXT_PUBLIC_STOREFRONT_ORIGIN?.trim()
    || requestOrigin
}
