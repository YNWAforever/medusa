import { NextResponse } from "next/server"
import { clearSessionCookies } from "../../../../src/lib/medusa/session"

export async function POST() {
  return clearSessionCookies(NextResponse.json({ customer: null }))
}
