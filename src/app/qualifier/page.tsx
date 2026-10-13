import type { Metadata } from "next";
import { LeadQualifier } from "@/components/LeadQualifier";

export const metadata: Metadata = { title: "Lead Qualifier" };

export default function Page() {
  return <LeadQualifier />;
}
