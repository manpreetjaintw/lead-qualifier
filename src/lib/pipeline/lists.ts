export const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com", "live.com", "msn.com",
  "aol.com", "icloud.com", "me.com", "mac.com", "comcast.net", "att.net", "sbcglobal.net", "verizon.net",
  "bellsouth.net", "cox.net", "charter.net", "protonmail.com", "proton.me", "gmx.com", "zoho.com", "mail.com",
]);

export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com",
  "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "maildrop.cc", "throwawaymail.com",
  "fakeinbox.com", "mailnesia.com", "mintemail.com",
]);

export const ROLE_PREFIXES = new Set([
  "info", "sales", "contact", "hello", "office", "admin", "support", "team", "help", "billing", "accounts",
  "accounting", "service", "enquiries", "inquiries", "marketing", "hr", "jobs", "careers", "mail", "general",
  "reception", "frontdesk", "dispatch", "estimates", "quotes", "bookings", "customerservice", "orders", "webmaster",
]);

export const NO_REPLY = /^(no-?reply|do-?not-?reply|bounce|mailer-daemon|postmaster)/;

/** Common typo domains -> intended domain. */
export const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gmail.co": "gmail.com",
  "gnail.com": "gmail.com", "gmail.con": "gmail.com", "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com",
  "yahoo.co": "yahoo.com", "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "outlok.com": "outlook.com",
  "outloo.com": "outlook.com", "aol.co": "aol.com", "iclod.com": "icloud.com",
};

export const DECISION_MAKER = /\b(owner|co-?owner|founder|co-?founder|president|ceo|chief executive|principal|managing (director|partner|member)|proprietor|partner)\b/i;
export const SENIOR = /\b(vp|vice president|head of|director|chief|cfo|coo|cto|cmo|cro|general manager|gm)\b/i;
