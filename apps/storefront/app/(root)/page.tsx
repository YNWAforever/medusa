import { defaultLocale } from "@fotomax/shared"
import { redirect } from "next/navigation"

export default function IndexPage() {
  redirect(`/${defaultLocale}`)
}
