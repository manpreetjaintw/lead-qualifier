import { AlertTriangle, CheckCircle2, CircleDashed, XCircle, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "good" | "warn" | "bad" | "none" | "unknown";
const TONE: Record<Tone, { icon: typeof CheckCircle2; cls: string }> = {
  good: { icon: CheckCircle2, cls: "text-hot" },
  warn: { icon: AlertTriangle, cls: "text-warm" },
  bad: { icon: XCircle, cls: "text-bad" },
  none: { icon: MinusCircle, cls: "text-muted-foreground" },
  unknown: { icon: CircleDashed, cls: "text-muted-foreground" },
};

export function StatusIcon({ tone, label }: { tone: Tone; label: string }) {
  const T = TONE[tone];
  return <T.icon className={cn("h-3.5 w-3.5 shrink-0", T.cls)} aria-label={label} />;
}

export const emailTone = (s: string): Tone => (s === "valid" ? "good" : s === "risky" ? "warn" : s === "invalid" ? "bad" : s === "missing" ? "none" : "unknown");
export const phoneTone = (s: string): Tone => (s === "valid" ? "good" : s === "invalid" ? "bad" : "none");
export const siteTone = (s: string): Tone => (s === "live" ? "good" : s === "dead" ? "bad" : s === "missing" ? "none" : "unknown");
