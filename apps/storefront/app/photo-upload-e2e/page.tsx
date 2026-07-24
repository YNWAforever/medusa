import { notFound } from "next/navigation";
import { CartDrawer } from "../../src/components/cart-drawer";
import { CartProvider } from "../../src/components/cart-provider";
import { PhotoEditorShell } from "../../src/components/photo-editor/photo-editor-shell";

type Props = { searchParams: Promise<{ locale?: string }> };

export default async function PhotoUploadE2EPage({ searchParams }: Props) {
  if (
    process.env.FOTOMAX_E2E !== "1" &&
    process.env.FOTOMAX_E2E_MOCKED !== "1"
  ) {
    notFound();
  }
  const { locale } = await searchParams;
  const resolvedLocale = locale === "zh-HK" ? "zh-HK" : "en";

  return (
    <CartProvider>
      <PhotoEditorShell jobId="job_1" locale={resolvedLocale} />
      <CartDrawer locale={resolvedLocale} />
    </CartProvider>
  );
}