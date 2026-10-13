"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ListChecks, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Company Finder", icon: Building2 },
  { href: "/qualifier", label: "Lead Qualifier", icon: ListChecks },
  { href: "/scraper", label: "Scraper", icon: RefreshCw },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex h-[68px] max-w-[1600px] items-center gap-4 px-5 sm:px-10">
          <Link href="/" className="shrink-0 text-xl font-bold tracking-tight">
            SaaSquatch <span className="text-primary">Leads</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 sm:gap-2" aria-label="Main">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  aria-label={label}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    active ? "bg-brand text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className="hidden md:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-10 sm:py-10">{children}</main>
    </div>
  );
}

/** Title block shared by every page, with room for an action or status on the right. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
