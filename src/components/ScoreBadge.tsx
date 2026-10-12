import { Flame, Snowflake, Sun } from "lucide-react";
import type { Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

const TIER = {
  hot: { label: "Hot", icon: Flame, cls: "bg-hot-bg text-hot ring-hot/30" },
  warm: { label: "Warm", icon: Sun, cls: "bg-warm-bg text-warm ring-warm/30" },
  cold: { label: "Cold", icon: Snowflake, cls: "bg-cold-bg text-cold ring-cold/30" },
};

export function ScoreBadge({ score, tier }: { score: number; tier: Tier }) {
  const t = TIER[tier];
  return (
    <div className={cn("inline-flex w-[76px] items-center gap-1.5 rounded-md px-2 py-1 ring-1", t.cls)} title={`${t.label} lead · score ${score}/100`}>
      <span className="text-base font-bold tabular-nums leading-none">{score}</span>
      <span className="flex items-center gap-0.5 text-[10px] font-semibold uppercase">
        <t.icon className="h-3 w-3" aria-hidden />
        {t.label}
      </span>
    </div>
  );
}

export const TIER_META = TIER;
