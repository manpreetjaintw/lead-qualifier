import "server-only";
import { resolveMx } from "node:dns/promises";
import * as cheerio from "cheerio";
import type { NetworkCheck, WebsiteCheck } from "./types";
import { withTimeout } from "./utils";
import { DEMO_NETWORK } from "./sample";
import { cached } from "./cache";
import { FREE_EMAIL_DOMAINS } from "./pipeline/lists";
import { extractContacts } from "./scraper/contacts";

const UA = "LeadQualifierBot/1.0 (+https://github.com/lead-qualifier; respects robots.txt)";
const DNS_TIMEOUT = 2500;
const HTTP_TIMEOUT = 4000;

export const offline = () => process.env.OFFLINE_CHECKS === "1";

/**
 * Canary: if the resolver can't find gmail.com's MX, DNS itself is down (sandbox, captive network).
 * In that case NXDOMAIN answers are not trustworthy and every check reports "unknown" instead of "dead".
 */
let dnsHealth: { ok: boolean; at: number } | null = null;
export async function dnsHealthy(): Promise<boolean> {
  if (dnsHealth && Date.now() - dnsHealth.at < 60_000) return dnsHealth.ok;
  const ok = await withTimeout(resolveMx("gmail.com"), DNS_TIMEOUT).then((r) => r.length > 0, () => false);
  dnsHealth = { ok, at: Date.now() };
  return ok;
}

export async function checkMx(domain: string): Promise<boolean | null> {
  if (!(await dnsHealthy())) return null;
  try {
    const records = await withTimeout(resolveMx(domain), DNS_TIMEOUT);
    return records.length > 0;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    // NXDOMAIN / no data are real answers. Anything else (timeout, no network) is unknown.
    if (code === "ENOTFOUND" || code === "ENODATA") return false;
    return null;
  }
}

async function get(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT);
  try {
    return await fetch(url, { headers: { "user-agent": UA, accept: "text/html,text/plain" }, redirect: "follow", signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function robotsAllows(origin: string): Promise<boolean> {
  try {
    const res = await get(`${origin}/robots.txt`);
    if (!res.ok) return true;
    const txt = (await res.text()).slice(0, 20000);
    let applies = false;
    for (const raw of txt.split(/\r?\n/)) {
      const line = raw.split("#")[0].trim();
      const [k, ...rest] = line.split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k)) applies = v === "*" || /leadqualifier/i.test(v);
      else if (applies && /^disallow$/i.test(k) && v === "/") return false;
    }
    return true;
  } catch {
    return true;
  }
}

export function parseHomepage(html: string, pageUrl = "http://localhost/"): Omit<WebsiteCheck, "status"> & { contactUrl?: string } {
  const $ = cheerio.load(html);
  const contacts = extractContacts($, pageUrl);
  const text = $("body").text().replace(/\s+/g, " ");
  const hrefs = $("a[href]").map((_, a) => String($(a).attr("href")).toLowerCase()).get();
  const socials = [
    ["linkedin", /linkedin\.com\/(company|in)\//],
    ["facebook", /facebook\.com\//],
    ["instagram", /instagram\.com\//],
    ["x", /(twitter|x)\.com\//],
    ["youtube", /youtube\.com\//],
  ].filter(([, re]) => hrefs.some((h) => (re as RegExp).test(h))).map(([n]) => n as string);

  const now = new Date().getFullYear();
  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)].map((m) => +m[1]).filter((y) => y <= now);
  const since = text.match(/\b(?:since|established|est\.?|founded(?: in)?|serving [a-z ]{0,30} since)\s*((?:18|19|20)\d{2})\b/i);
  const hiring = hrefs.some((h) => /careers|jobs|join-?us|we-?re-?hiring/.test(h)) || /\bwe(?:'|’)re hiring\b|\bnow hiring\b/i.test(text);

  return {
    title: $("title").first().text().trim().slice(0, 140) || undefined,
    description: ($('meta[name="description"]').attr("content") || $('meta[property="og:description"]').attr("content") || "").trim().slice(0, 240) || undefined,
    socials,
    copyrightYear: years.length ? Math.max(...years) : undefined,
    sinceYear: since ? +since[1] : undefined,
    hiring,
    emails: contacts.emails,
    phones: contacts.phones,
    contactUrl: contacts.contactUrl,
  };
}

export async function checkWebsite(domain: string): Promise<WebsiteCheck> {
  for (const origin of [`https://${domain}`, `https://www.${domain}`, `http://${domain}`]) {
    try {
      if (!(await robotsAllows(origin))) return { status: "blocked", socials: [] };
      const res = await get(origin);
      if (res.status >= 500) continue;
      const html = (await res.text()).slice(0, 500_000);
      const { contactUrl, ...page } = parseHomepage(html, res.url || origin);
      // Many small-business sites only publish an address on their contact page: follow one link, same host.
      if (res.ok && !page.emails?.length && contactUrl) {
        try {
          const contact = await get(contactUrl);
          if (contact.ok) {
            const more = extractContacts(cheerio.load((await contact.text()).slice(0, 500_000)), contactUrl);
            page.emails = more.emails;
            page.phones = [...new Set([...(page.phones ?? []), ...more.phones])].slice(0, 3);
          }
        } catch {
          /* the homepage result still stands */
        }
      }
      return { status: res.ok ? "live" : "dead", ...page };
    } catch (e) {
      const cause = (e as { cause?: { code?: string } }).cause?.code;
      if (cause === "ENOTFOUND" && (await dnsHealthy())) return { status: "dead", socials: [] };
    }
  }
  return { status: "unknown", socials: [] };
}

export interface CheckRequest {
  id: string;
  domain: string;
  emailDomain: string;
}

/** MX for the email domain and a homepage check for the website domain, each cached separately. */
export async function checkLead(req: CheckRequest, demo = false): Promise<NetworkCheck> {
  if (demo) {
    const site = DEMO_NETWORK[req.domain]?.website ?? { status: req.domain ? "unknown" : "missing", socials: [] };
    const mx = FREE_EMAIL_DOMAINS.has(req.emailDomain) ? true : DEMO_NETWORK[req.emailDomain]?.mx ?? null;
    return { mx: req.emailDomain ? mx : null, website: site, simulated: true };
  }
  const mx = !req.emailDomain
    ? null
    : FREE_EMAIL_DOMAINS.has(req.emailDomain)
      ? true
      : offline()
        ? null
        : await cached(`mx:${req.emailDomain}`, () => checkMx(req.emailDomain), (v) => v !== null);
  const website: WebsiteCheck = !req.domain
    ? { status: "missing", socials: [] }
    : offline()
      ? { status: "unknown", socials: [] }
      : await cached(`web:${req.domain}`, () => checkWebsite(req.domain), (v) => v.status !== "unknown");
  return { mx, website };
}
