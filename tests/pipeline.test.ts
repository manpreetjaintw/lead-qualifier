import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { extractDomain, parseNumber, parseYear, normalizeRows, tidyName } from "@/lib/pipeline/normalize";
import { canonicalName, dedupe, jaroWinkler } from "@/lib/pipeline/dedupe";
import { checkEmailSyntax, checkPhone, combineChecks } from "@/lib/pipeline/validate";
import { PRESETS, scoreLead } from "@/lib/pipeline/score";
import { guessMapping } from "@/lib/mapping";
import { prepare, scoreAll, computeStats, emailDomain } from "@/lib/pipeline";
import { DEMO_NETWORK } from "@/lib/sample";
import type { NetworkCheck, RawRow } from "@/lib/types";
import { FREE_EMAIL_DOMAINS } from "@/lib/pipeline/lists";

describe("normalize", () => {
  it("extracts domains from messy URLs", () => {
    expect(extractDomain("https://www.Acme.com/about?x=1")).toBe("acme.com");
    expect(extractDomain("acme.co.uk")).toBe("acme.co.uk");
    expect(extractDomain("not a url")).toBe("");
  });
  it("parses revenue and headcount formats", () => {
    expect(parseNumber("$4.2M")).toBe(4_200_000);
    expect(parseNumber("1.8 million")).toBe(1_800_000);
    expect(parseNumber("$950K")).toBe(950_000);
    expect(parseNumber("25-30")).toBe(28);
    expect(parseNumber("1,200")).toBe(1200);
    expect(parseNumber("")).toBeNull();
  });
  it("parses years and rejects the future", () => {
    expect(parseYear("Est. 1994")).toBe(1994);
    expect(parseYear("2999")).toBeNull();
  });
  it("tidies ALL CAPS names but keeps mixed case", () => {
    expect(tidyName("BRIGHTLINE HVAC SERVICES LLC")).toBe("Brightline HVAC Services LLC");
    expect(tidyName("iRobot")).toBe("iRobot");
  });
});

describe("dedupe", () => {
  it("canonicalises company names", () => {
    expect(canonicalName("The ACME Plumbing, Inc.")).toBe("acme plumbing");
    expect(canonicalName("Keystone Bookkeeping & Tax")).toBe(canonicalName("Keystone Bookkeeping and Tax Inc."));
  });
  it("jaro-winkler behaves", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.961, 2);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
  });
  it("merges same company across sources and fills gaps", () => {
    const leads = normalizeRows(
      [
        { c: "Precision Tool & Die Co", w: "precisiontooldie.com", e: "rhale@precisiontooldie.com", p: "(616) 555-0122", city: "Grand Rapids", src: "Crunchbase" },
        { c: "PRECISION TOOL AND DIE", w: "", e: "", p: "616-555-0122", city: "Grand Rapids", src: "Google Maps" },
        { c: "Precision Tool Supply", w: "precisiontoolsupply.com", e: "", p: "", city: "Detroit", src: "Apollo" },
      ],
      { company: "c", website: "w", email: "e", phone: "p", city: "city", source: "src" },
    );
    const out = dedupe(leads);
    expect(out).toHaveLength(2);
    const merged = out.find((l) => l.rowIds.length === 2)!;
    expect(merged.email).toBe("rhale@precisiontooldie.com");
    expect(merged.sources.sort()).toEqual(["Crunchbase", "Google Maps"]);
  });
  it("does not merge similar names in different cities", () => {
    const leads = normalizeRows(
      [
        { c: "Summit Plumbing", city: "Denver" },
        { c: "Summit Plumbing", city: "Boise" },
      ],
      { company: "c", city: "city" },
    );
    expect(dedupe(leads)).toHaveLength(2);
  });
  it("prefers a personal email over a role inbox when merging", () => {
    const leads = normalizeRows(
      [
        { c: "Ironclad Trucking", w: "ironcladtrucking.com", e: "dispatch@ironcladtrucking.com" },
        { c: "Ironclad Trucking Inc", w: "ironcladtrucking.com", e: "wes.duncan@ironcladtrucking.com" },
      ],
      { company: "c", website: "w", email: "e" },
    );
    // "dispatch" is not a role prefix we merge away from, but "info" is:
    const leads2 = normalizeRows(
      [
        { c: "Acme", w: "acme.com", e: "info@acme.com", t: "" },
        { c: "Acme", w: "acme.com", e: "jane@acme.com", t: "Owner" },
      ],
      { company: "c", website: "w", email: "e", title: "t" },
    );
    expect(dedupe(leads)).toHaveLength(1);
    expect(dedupe(leads2)[0].email).toBe("jane@acme.com");
  });
});

describe("validate", () => {
  it("classifies emails", () => {
    expect(checkEmailSyntax("gary@brightlinehvac.com", "brightlinehvac.com").status).toBe("valid");
    expect(checkEmailSyntax("info@acme.com").kind).toBe("role");
    expect(checkEmailSyntax("info@acme.com").status).toBe("risky");
    expect(checkEmailSyntax("rosa@mailinator.com").kind).toBe("disposable");
    expect(checkEmailSyntax("mia@@sunsetbakery").status).toBe("invalid");
    expect(checkEmailSyntax("noreply@x.com").status).toBe("invalid");
    expect(checkEmailSyntax("", "").status).toBe("missing");
  });
  it("suggests typo fixes", () => {
    const r = checkEmailSyntax("tom.alvarez@gmial.com");
    expect(r.status).toBe("invalid");
    expect(r.suggestion).toBe("tom.alvarez@gmail.com");
  });
  it("flags email domains that don't match the website", () => {
    expect(checkEmailSyntax("karen@greenfield-hh.net", "greenfieldhomehealth.com").status).toBe("risky");
    expect(checkEmailSyntax("jim@aol.com", "oldmillroofing.com").status).toBe("valid");
  });
  it("validates phones", () => {
    expect(checkPhone("(614) 555-0182", "USA").status).toBe("valid");
    expect(checkPhone("(614) 555-0182", "USA").e164).toBe("+16145550182");
    expect(checkPhone("555-01", "USA").status).toBe("invalid");
    expect(checkPhone("", "").status).toBe("missing");
  });
  it("downgrades emails whose domain has no MX record", () => {
    const [lead] = normalizeRows([{ e: "jim@deadco.com" }], { email: "e" });
    expect(combineChecks(lead, { mx: false, website: { status: "dead", socials: [] } }).email.status).toBe("invalid");
    expect(combineChecks(lead, { mx: null, website: { status: "unknown", socials: [] } }).email.status).toBe("valid");
  });
});

describe("score", () => {
  const row = { c: "Brightline HVAC", w: "brightlinehvac.com", e: "gary@brightlinehvac.com", p: "(614) 555-0182", t: "Owner", i: "HVAC", emp: "28", rev: "$4.2M", f: "1994", city: "Columbus" };
  const map = { company: "c", website: "w", email: "e", phone: "p", title: "t", industry: "i", employees: "emp", revenue: "rev", foundedYear: "f", city: "city" } as const;
  const net: NetworkCheck = { mx: true, website: { status: "live", socials: [] } };

  it("scores an ideal ETA target as hot with reasons", () => {
    const [lead] = normalizeRows([row], map);
    const s = scoreLead(lead, combineChecks(lead, net), PRESETS.eta);
    expect(s.tier).toBe("hot");
    expect(s.reasons.some((r) => r.label.includes("succession"))).toBe(true);
    expect(s.score).toBeLessThanOrEqual(100);
  });
  it("penalises oversized companies for ETA but not B2B", () => {
    const [lead] = normalizeRows([{ ...row, emp: "2400", rev: "$640M", t: "Procurement Specialist" }], map);
    const eta = scoreLead(lead, combineChecks(lead, net), PRESETS.eta);
    const b2b = scoreLead(lead, combineChecks(lead, net), PRESETS.b2b);
    expect(b2b.score).toBeGreaterThan(eta.score);
  });
  it("weights scale categories, and zero weight removes them", () => {
    const [lead] = normalizeRows([row], map);
    const c = combineChecks(lead, net);
    const none = scoreLead(lead, c, PRESETS.eta, { contact: 0, fit: 0, signals: 0, quality: 0 });
    expect(none.score).toBe(0);
    expect(none.reasons).toHaveLength(0);
  });
});

describe("mapping", () => {
  it("maps SaaSquatch / Apollo style headers", () => {
    const m = guessMapping(["Company Name", "Website", "Owner Name", "Title", "Email", "Phone", "Est. Revenue", "Founded", "Employees"]);
    expect(m).toMatchObject({ company: "Company Name", website: "Website", contactName: "Owner Name", email: "Email", revenue: "Est. Revenue", foundedYear: "Founded" });
  });
});

describe("sample dataset end to end", () => {
  const csv = readFileSync("public/sample-leads.csv", "utf8");
  const rows = Papa.parse<RawRow>(csv, { header: true, skipEmptyLines: true }).data;
  const leads = prepare(rows, guessMapping(Object.keys(rows[0])));
  const net: Record<string, NetworkCheck> = {};
  for (const l of leads) {
    const ed = emailDomain(l);
    net[l.id] = {
      mx: ed ? (FREE_EMAIL_DOMAINS.has(ed) ? true : DEMO_NETWORK[ed]?.mx ?? null) : null,
      website: DEMO_NETWORK[l.domain]?.website ?? { status: "unknown", socials: [] },
    };
  }
  const scored = scoreAll(leads, net, PRESETS.eta);
  const stats = computeStats(rows.length, scored);

  it("merges the planted duplicates", () => {
    expect(stats.rowsIn).toBe(35);
    expect(stats.duplicatesMerged).toBe(5);
    expect(stats.leadsOut).toBe(30);
  });
  it("catches the planted bad emails", () => {
    const bad = scored.filter((l) => l.checks.email.status === "invalid").map((l) => l.company);
    expect(bad).toEqual(expect.arrayContaining(["Riverbend Pest Control", "Coastal Janitorial Solutions", "Sunset Bakery", "Northstar Managed Services", "Quickfix Phone Repair"]));
  });
  it("ranks an established owner-run business above a mega-corp for ETA", () => {
    const rank = (name: string) => scored.findIndex((l) => l.company.startsWith(name));
    expect(rank("Brightline")).toBeLessThan(rank("MegaCorp"));
    expect(scored[0].tier).toBe("hot");
  });
});
