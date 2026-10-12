import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const STEPS = ["Upload", "Map & choose goal", "Review & export"] as const;

export function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              "grid h-6 w-6 place-items-center rounded-full text-xs font-semibold",
              i < current && "bg-primary text-primary-foreground",
              i === current && "bg-primary/15 text-primary ring-2 ring-primary",
              i > current && "bg-muted text-muted-foreground",
            )}
            aria-current={i === current ? "step" : undefined}
          >
            {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </span>
          <span className={cn("hidden sm:inline", i === current ? "font-medium" : "text-muted-foreground")}>{s}</span>
          {i < STEPS.length - 1 && <span className="mx-1 h-px w-8 bg-border" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}
