import { notFound } from "next/navigation";
import { PhotoEditorShell } from "../../src/components/photo-editor/photo-editor-shell";

type Props = { searchParams: Promise<{ locale?: string }> };
export default async function PhotoUploadE2EPage({ searchParams }: Props) {
  if (process.env.FOTOMAX_E2E_MOCKED !== "1") notFound();
  const { locale } = await searchParams;
  return (
    <PhotoEditorShell
      jobId="job_1"
      locale={locale === "zh-HK" ? "zh-HK" : "en"}
    />
  );
}
