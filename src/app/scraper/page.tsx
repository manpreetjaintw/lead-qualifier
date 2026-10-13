import type { Metadata } from "next";
import { ScraperPanel } from "@/components/ScraperPanel";

export const metadata: Metadata = { title: "Scraper" };

export default function Page() {
  return <ScraperPanel />;
}
