import "../globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "FotoMax Photo Upload Verification",
};

export default function PhotoUploadE2ELayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
