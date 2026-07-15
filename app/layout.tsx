import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRE Press Release Generator",
  description:
    "Free tool for CRE brokers and principals — generate a draft press release from a short brief in about a minute.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
