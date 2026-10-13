import type { CheerioAPI } from "cheerio";
import { FREE_EMAIL_DOMAINS } from "../pipeline/lists";

const EMAIL_RE = /[a-z0-9][a-z0-9._%+-]*@(?:[a-z0-9-]+\.)+[a-z]{2,}/gi;
// Addresses that appear in page source but never belong to the business itself.
const JUNK_EMAIL = /\.(png|jpe?g|gif|webp|svg|css|js)$|@(example|domain|email|yourdomain|sentry|sentry-next|wixpress|godaddy)\.|^(your|name|user|email)@|@\d+x\./i;

/** Emails, phone numbers and a contact-page link found in a parsed page. Pure and synchronous. */
export function extractContacts($: CheerioAPI, pageUrl: string) {
  const emails = new Set<string>();
  const phones = new Set<string>();
  let contactUrl: string | undefined;

  $("a[href]").each((_, a) => {
    const href = String($(a).attr("href")).trim();
    if (/^mailto:/i.test(href)) {
      const addr = decodeURIComponent(href.slice(7).split("?")[0]).trim().toLowerCase();
      if (addr) emails.add(addr);
    } else if (/^tel:/i.test(href)) {
      const digits = href.slice(4).replace(/[^\d+]/g, "");
      if (digits.replace(/\D/g, "").length >= 7) phones.add(digits);
    } else if (!contactUrl && /contact|get-in-touch|kontakt/i.test(href)) {
      try {
        const url = new URL(href, pageUrl);
        if (url.host === new URL(pageUrl).host && /^https?:$/.test(url.protocol)) contactUrl = url.toString();
      } catch {
        /* not a usable link */
      }
    }
  });

  // Addresses written as plain text. Scripts and styles are skipped: they are full of look-alikes.
  const text = $("body").clone().find("script,style,noscript").remove().end().text();
  for (const m of text.match(EMAIL_RE) ?? []) emails.add(m.toLowerCase().replace(/\.$/, ""));

  return {
    emails: [...emails].filter((e) => !JUNK_EMAIL.test(e) && e.length <= 80).slice(0, 5),
    phones: [...phones].slice(0, 3),
    contactUrl,
  };
}

/**
 * Pick the address most likely to reach the business: its own domain first, then a webmail address
 * (common for owner-operators). Addresses on some other company's domain are usually a booking or
 * marketing vendor's, so they are never used.
 */
export function bestEmail(emails: string[], domain: string): string {
  const root = domain.split(".").slice(-2).join(".");
  const own = root ? emails.find((e) => e.endsWith(`@${root}`) || e.endsWith(`.${root}`)) : undefined;
  return own ?? emails.find((e) => FREE_EMAIL_DOMAINS.has(e.split("@")[1])) ?? "";
}
