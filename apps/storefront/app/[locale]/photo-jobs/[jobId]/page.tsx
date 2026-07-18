import { assertLocale } from "../../../../src/lib/locales"
import { PhotoEditorShell } from "../../../../src/components/photo-editor/photo-editor-shell"

type Props = { params: Promise<{ locale: string; jobId: string }> }
export default async function PhotoJobPage({ params }: Props) {
  const { locale, jobId } = await params
  return <PhotoEditorShell locale={assertLocale(locale)} jobId={jobId} />
}

