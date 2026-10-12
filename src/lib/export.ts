import Papa from "papaparse";
import type { ScoredLead } from "./types";

const reasonsText = (l: ScoredLead) => l.reasons.map((r) => `${r.points > 0 ? "+" : ""}${r.points} ${r.label}`).join("; ");

export function toCleanCsv(leads: ScoredLead[]): string {
  return Papa.unparse(
    leads.map((l) => ({
      Score: l.score,
      Tier: l.tier,
      Company: l.company,
      Website: l.domain,
      "Contact Name": l.contactName,
      Title: l.title,
      Email: l.checks.email.suggestion ?? l.email,
      "Email Status": l.checks.email.status,
      "Email Type": l.checks.email.kind,
      Phone: l.checks.phone.e164 || l.phone,
      "Phone Status": l.checks.phone.status,
      "Website Status": l.checks.website.status,
      Industry: l.industry,
      City: l.city,
      State: l.state,
      Country: l.country,
      Employees: l.employees ?? "",
      Revenue: l.revenue ?? "",
      Founded: l.foundedYear ?? l.checks.website.sinceYear ?? "",
      LinkedIn: l.linkedin,
      Sources: l.sources.join(" | "),
      "Merged Records": l.rowIds.length,
      "Why This Score": reasonsText(l),
    })),
  );
}

/** Column names match HubSpot's default contact + company import properties. */
export function toHubspotCsv(leads: ScoredLead[]): string {
  return Papa.unparse(
    leads.map((l) => {
      const [first, ...rest] = l.contactName.replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").split(" ");
      return {
        "First Name": first ?? "",
        "Last Name": rest.join(" "),
        "Email": l.checks.email.status === "invalid" ? "" : l.email,
        "Phone Number": l.checks.phone.e164,
        "Job Title": l.title,
        "Company Name": l.company,
        "Company Domain Name": l.domain,
        "Industry": l.industry,
        "City": l.city,
        "State/Region": l.state,
        "Country/Region": l.country,
        "Number of Employees": l.employees ?? "",
        "Annual Revenue": l.revenue ?? "",
        "Lead Status": l.tier === "hot" ? "OPEN" : l.tier === "warm" ? "NEW" : "UNQUALIFIED",
        "Lifecycle Stage": l.tier === "hot" ? "salesqualifiedlead" : "lead",
        "Lead Score (Lead Qualifier)": l.score,
        "Score Reasons": reasonsText(l),
      };
    }),
  );
}

export function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}
