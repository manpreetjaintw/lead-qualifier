import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import type { Checks, EmailCheck, Lead, NetworkCheck, PhoneCheck } from "../types";
import { countryCode } from "./normalize";
import { DISPOSABLE_DOMAINS, DOMAIN_TYPOS, FREE_EMAIL_DOMAINS, NO_REPLY, ROLE_PREFIXES } from "./lists";

// Pragmatic RFC 5322 subset: what real mail servers accept in practice.
const EMAIL_RE = /^[a-z0-9](?:[a-z0-9._%+'-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** Everything about an email that can be decided without the network. */
export function checkEmailSyntax(email: string, websiteDomain = ""): EmailCheck {
  if (!email) return { status: "missing", kind: "none", mx: null, notes: ["No email"] };
  const notes: string[] = [];
  if (!EMAIL_RE.test(email) || email.includes("..")) {
    return { status: "invalid", kind: "none", mx: null, notes: ["Malformed address"] };
  }
  const [local, domain] = email.split("@");
  if (DOMAIN_TYPOS[domain]) {
    return {
      status: "invalid",
      kind: "none",
      mx: null,
      suggestion: `${local}@${DOMAIN_TYPOS[domain]}`,
      notes: [`Typo in domain, did you mean ${DOMAIN_TYPOS[domain]}?`],
    };
  }
  if (DISPOSABLE_DOMAINS.has(domain)) return { status: "invalid", kind: "disposable", mx: null, notes: ["Disposable inbox"] };
  if (NO_REPLY.test(local)) return { status: "invalid", kind: "role", mx: null, notes: ["No-reply address"] };

  let kind: EmailCheck["kind"] = "personal";
  let status: EmailCheck["status"] = "valid";
  const base = local.split(/[+.]/)[0];
  if (ROLE_PREFIXES.has(local) || ROLE_PREFIXES.has(base)) {
    kind = "role";
    status = "risky";
    notes.push("Generic inbox (rarely reaches a decision maker)");
  } else if (FREE_EMAIL_DOMAINS.has(domain)) {
    kind = "free";
    notes.push("Free webmail (common for owner-operators)");
  }
  if (websiteDomain && !FREE_EMAIL_DOMAINS.has(domain) && !domainsRelated(domain, websiteDomain)) {
    status = "risky";
    notes.push(`Email domain differs from website (${websiteDomain})`);
  }
  return { status, kind, mx: null, notes };
}

function domainsRelated(a: string, b: string) {
  const root = (d: string) => d.split(".").slice(-2).join(".");
  return root(a) === root(b);
}

export function checkPhone(phone: string, country: string): PhoneCheck {
  if (!phone) return { status: "missing", e164: "" };
  const parsed = parsePhoneNumberFromString(phone, countryCode(country));
  if (!parsed || !parsed.isValid()) return { status: "invalid", e164: "" };
  return { status: "valid", e164: parsed.number, type: parsed.getType() };
}

/** Combine offline checks with the server's network results for one lead. */
export function combineChecks(lead: Lead, net: NetworkCheck | undefined): Checks {
  const email = checkEmailSyntax(lead.email, lead.domain);
  if (net && (email.status === "valid" || email.status === "risky")) {
    email.mx = net.mx;
    if (net.mx === false) {
      email.status = "invalid";
      email.notes.unshift("Domain has no mail server (MX)");
    }
  }
  const website = net?.website ?? { status: lead.domain ? "unknown" : "missing", socials: [] };
  return { email, phone: checkPhone(lead.phone, lead.country), website, simulated: net?.simulated };
}
