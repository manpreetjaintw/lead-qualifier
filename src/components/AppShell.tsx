import { Building2, Users, UsersRound, Newspaper, Mail, ShieldCheck, Linkedin, ScanSearch, LineChart, Sparkles, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Companies", icon: Building2 },
  { label: "Persons", icon: Users },
  { label: "Teams", icon: UsersRound },
  { label: "AI News", icon: Newspaper },
  { label: "Email Generator", icon: Mail },
  { label: "Validators", icon: ShieldCheck },
  { label: "Lead Qualifier", icon: Sparkles, active: true, badge: "NEW" },
  { label: "LinkedIn Messenger", icon: Linkedin },
  { label: "AI Web Scanner", icon: ScanSearch, badge: "SOON" },
  { label: "Financial Analysis", icon: LineChart, badge: "SOON" },
];

/** Mirrors the SaaSquatch app navigation so the module reads as part of the product. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card px-3 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">SQ</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">SaaSquatch</div>
            <div className="text-[11px] text-muted-foreground">Leads</div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main">
          {NAV.map(({ label, icon: Icon, active, badge }) => (
            <div
              key={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm",
                active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground",
                !active && "cursor-not-allowed opacity-70",
              )}
              title={active ? undefined : "Part of the main SaaSquatch app"}
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {badge && (
                <span className={cn("rounded px-1.5 py-px text-[9px] font-semibold tracking-wide", badge === "NEW" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  {badge}
                </span>
              )}
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-2 px-2.5 text-xs text-muted-foreground">
          <HelpCircle className="h-3.5 w-3.5" /> Prototype module for SaaSquatch Leads
        </div>
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
