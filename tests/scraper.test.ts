import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { buildQuery, parseElement, type OsmElement } from "@/lib/scraper/overpass";
import { industryById } from "@/lib/scraper/industries";
import { bestEmail, extractContacts } from "@/lib/scraper/contacts";
import { parseCompanyQuery, queryCompanies } from "@/lib/scraper/query";
import type { Company } from "@/lib/scraper/types";
import { describeRunError } from "@/lib/client";
import { LISTING_MAX, PRESETS, scoreLead } from "@/lib/pipeline/score";
import { combineChecks } from "@/lib/pipeline/validate";
import { normalizeRows } from "@/lib/pipeline/normalize";

const plumbing = industryById("plumbing")!;
const accounting = industryById("accounting")!;
const place = { city: "Austin", state: "Texas", country: "US" };

describe("overpass", () => {
  it("builds one named filter per tag inside the area", () => {
    const q = buildQuery(3600113314, accounting);
    expect(q).toContain("area(3600113314)->.a;");
    expect(q).toContain('nwr["name"]["office"="accountant"](area.a);');
    expect(q).toContain('nwr["name"]["office"="tax_advisor"](area.a);');
    expect(q).toMatch(/out tags center \d+;$/);
  });

  it("maps listing tags to company fields", () => {
    const el: OsmElement = {
      type: "way",
      id: 42,
      center: { lat: 30.26, lon: -97.74 },
      tags: {
        name: "Lone Star Plumbing",
        craft: "plumber",
        "contact:website": "https://lonestarplumbing.example; https://old.example",
        phone: "+1 512 555 0100;+1 512 555 0101",
        "contact:email": "Office@LoneStarPlumbing.example",
        "addr:housenumber": "100",
        "addr:street": "Congress Ave",
        "addr:postcode": "78701",
        start_date: "1987-03",
        "contact:facebook": "lonestarplumbing",
      },
    };
    expect(parseElement(el, plumbing, place)).toMatchObject({
      id: "w42",
      name: "Lone Star Plumbing",
      category: "craft=plumber",
      website: "https://lonestarplumbing.example",
      phone: "+1 512 555 0100",
      email: "office@lonestarplumbing.example",
      address: "100 Congress Ave",
      city: "Austin",
      state: "Texas",
      country: "US",
      lat: 30.26,
      foundedYear: 1987,
      socials: ["facebook"],
      sourceUrl: "https://www.openstreetmap.org/way/42",
    });
  });

  it("prefers the listing's own city and skips unnamed elements", () => {
    expect(parseElement({ type: "node", id: 1, tags: { name: "A", "addr:city": "Round Rock" } }, plumbing, place)?.city).toBe("Round Rock");
    expect(parseElement({ type: "node", id: 2, tags: { craft: "plumber" } }, plumbing, place)).toBeNull();
    expect(parseElement({ type: "node", id: 3 }, plumbing, place)).toBeNull();
  });

  it("leaves out branches of national chains", () => {
    expect(parseElement({ type: "node", id: 4, tags: { name: "Jiffy Lube", brand: "Jiffy Lube", "brand:wikidata": "Q6192247" } }, plumbing, place)).toBeNull();
  });
});

describe("contact extraction", () => {
  const html = `<html><body>
    <a href="mailto:Hello@Acme.example?subject=Hi">Email us</a>
    <a href="tel:+1 (512) 555-0199">Call</a>
    <a href="/contact-us">Contact</a>
    <a href="https://elsewhere.example/contact">Partner</a>
    <p>Billing: accounts@acme.example. Logo: logo@2x.png</p>
    <script>var e = "tracker@sentry.io";</script>
  </body></html>`;
  const found = extractContacts(cheerio.load(html), "https://acme.example/");

  it("reads mailto links and plain-text addresses, ignoring assets and scripts", () => {
    expect(found.emails).toEqual(["hello@acme.example", "accounts@acme.example"]);
  });
  it("reads tel links", () => {
    expect(found.phones).toEqual(["+15125550199"]);
  });
  it("only follows a contact page on the same host", () => {
    expect(found.contactUrl).toBe("https://acme.example/contact-us");
  });
  it("prefers the company's own domain, then webmail, and never a vendor's address", () => {
    expect(bestEmail(["owner@gmail.com", "info@acme.example"], "acme.example")).toBe("info@acme.example");
    expect(bestEmail(["help@bookingvendor.example", "owner@gmail.com"], "acme.example")).toBe("owner@gmail.com");
    expect(bestEmail(["help@bookingvendor.example"], "acme.example")).toBe("");
    expect(bestEmail([], "acme.example")).toBe("");
  });
});

describe("company query", () => {
  const company = (over: Partial<Company>): Company => ({
    id: "n1", name: "Acme", industry: "Plumbing", category: "", website: "", domain: "", email: "", emailStatus: "missing", phone: "",
    address: "", city: "Austin", state: "Texas", postcode: "", country: "US", lat: null, lon: null, foundedYear: null, openingHours: "",
    socials: [], site: null, score: 50, tier: "warm", reasons: [], searchId: "s1", sourceUrl: "", firstSeen: "2026-01-01T00:00:00.000Z", lastSeen: "2026-01-01T00:00:00.000Z",
    ...over,
  });
  const all = [
    company({ id: "n1", name: "Acme Plumbing", score: 82, tier: "hot", email: "joe@acme.example", domain: "acme.example" }),
    company({ id: "n2", name: "Bolt Dental", industry: "Dental", city: "Denver", score: 45 }),
    company({ id: "n3", name: "Cedar Plumbing", score: 20, tier: "cold", firstSeen: "2026-02-01T00:00:00.000Z" }),
  ];
  const run = (qs: string) => queryCompanies(all, parseCompanyQuery(new URLSearchParams(qs)));

  it("clamps and defaults malformed parameters", () => {
    const q = parseCompanyQuery(new URLSearchParams("page=-3&limit=9999&minScore=abc&tier=lukewarm&sort=random"));
    expect(q).toMatchObject({ page: 1, limit: 100, minScore: 0, tier: "", sort: "score" });
  });
  it("filters by industry, city, tier and score, case-insensitively", () => {
    expect(run("industry=plumbing").data.map((c) => c.id)).toEqual(["n1", "n3"]);
    expect(run("city=denver").data.map((c) => c.id)).toEqual(["n2"]);
    expect(run("tier=hot").total).toBe(1);
    expect(run("minScore=40").data.map((c) => c.id)).toEqual(["n1", "n2"]);
  });
  it("filters by keyword and contact availability", () => {
    expect(run("q=ACME").data.map((c) => c.id)).toEqual(["n1"]);
    expect(run("hasEmail=1&hasWebsite=true").data.map((c) => c.id)).toEqual(["n1"]);
  });
  it("sorts and paginates while reporting the full total", () => {
    expect(run("sort=name").data.map((c) => c.name)).toEqual(["Acme Plumbing", "Bolt Dental", "Cedar Plumbing"]);
    expect(run("sort=recent").data[0].id).toBe("n3");
    const page2 = run("limit=2&page=2");
    expect(page2.total).toBe(3);
    expect(page2.data.map((c) => c.id)).toEqual(["n3"]);
  });
});

describe("listing score", () => {
  it("ranks a listing against what a listing can show, not a full CRM record", () => {
    const row = { company: "Acme Plumbing", website: "acme.example", email: "joe@acme.example", phone: "+1 512 555 0100", industry: "Plumbing", city: "Austin", country: "US", foundedYear: "1990" };
    const [lead] = normalizeRows([row], Object.fromEntries(Object.keys(row).map((k) => [k, k])));
    const checks = combineChecks(lead, { mx: true, website: { status: "live", socials: ["linkedin"] } });
    const asUpload = scoreLead(lead, checks, PRESETS.eta);
    const asListing = scoreLead(lead, checks, PRESETS.eta, PRESETS.eta.weights, LISTING_MAX);
    expect(asListing.score).toBeGreaterThan(asUpload.score);
    expect(asListing.tier).toBe("hot");
    expect(asListing.score).toBeLessThanOrEqual(100);
  });
});

describe("run errors", () => {
  it("explains upstream failures in plain language", () => {
    expect(describeRunError("Dental in Austin, Texas: This operation was aborted")).toBe("Dental in Austin, Texas was not updated: the data source took too long to answer. It is retried first on the next run.");
    expect(describeRunError("Legal in Columbus, Ohio: overpass-api.de responded 504")).toContain("the data source was busy");
    expect(describeRunError("Legal in Columbus, Ohio: fetch failed")).toContain("could not be reached");
  });
  it("keeps messages it does not recognise", () => {
    expect(describeRunError('Plumbing in Austin: Unknown industry "x"')).toBe('Plumbing in Austin was not updated: Unknown industry "x".');
  });
});
