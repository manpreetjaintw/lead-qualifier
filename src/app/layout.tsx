import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lead Qualifier · SaaSquatch Leads",
  description: "Dedupe, validate, enrich and score your leads before you spend a credit.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
