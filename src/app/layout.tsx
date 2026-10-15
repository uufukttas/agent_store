import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GradeUp Agent",
  description: "GradeUp agent platformu",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
