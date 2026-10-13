export const FIELDS = [
  "company",
  "website",
  "email",
  "phone",
  "contactName",
  "title",
  "industry",
  "city",
  "state",
  "country",
  "employees",
  "revenue",
  "foundedYear",
  "linkedin",
  "source",
] as const;

export type Field = (typeof FIELDS)[number];
export type RawRow = Record<string, string>;
export type ColumnMapping = Partial<Record<Field, string>>;

export interface Lead {
  id: string;
  company: string;
  website: string;
  domain: string;
  email: string;
  phone: string;
  phoneE164: string;
  contactName: string;
  title: string;
  industry: string;
  city: string;
  state: string;
  country: string;
  employees: number | null;
  revenue: number | null;
  foundedYear: number | null;
  linkedin: string;
  sources: string[];
  /** Ids of the raw rows merged into this lead (length 1 = no duplicates). */
  rowIds: number[];
}

export type EmailStatus = "valid" | "risky" | "invalid" | "unknown" | "missing";
export type EmailKind = "personal" | "role" | "free" | "disposable" | "none";

export interface EmailCheck {
  status: EmailStatus;
  kind: EmailKind;
  mx: boolean | null;
  suggestion?: string;
  notes: string[];
}

export interface PhoneCheck {
  status: "valid" | "invalid" | "missing";
  e164: string;
  type?: string;
}

export interface WebsiteCheck {
  status: "live" | "dead" | "unknown" | "missing" | "blocked";
  title?: string;
  description?: string;
  socials: string[];
  copyrightYear?: number;
  sinceYear?: number;
  hiring?: boolean;
  /** Contact details published on the homepage or contact page. */
  emails?: string[];
  phones?: string[];
}

export interface NetworkCheck {
  mx: boolean | null;
  website: WebsiteCheck;
  simulated?: boolean;
}

export interface Checks {
  email: EmailCheck;
  phone: PhoneCheck;
  website: WebsiteCheck;
  simulated?: boolean;
}

export type Category = "contact" | "fit" | "signals" | "quality";

export interface Reason {
  category: Category;
  label: string;
  points: number;
}

export type Tier = "hot" | "warm" | "cold";

export interface ScoredLead extends Lead {
  checks: Checks;
  score: number;
  tier: Tier;
  reasons: Reason[];
}

export interface RunStats {
  rowsIn: number;
  leadsOut: number;
  duplicatesMerged: number;
  invalidEmails: number;
  riskyEmails: number;
  roleEmails: number;
  deadWebsites: number;
  invalidPhones: number;
  hot: number;
  warm: number;
  cold: number;
}
