import { Loader2 } from "lucide-react";
import { Card, Progress } from "./ui";

export function Processing({ stage, done, total }: { stage: string; done: number; total: number }) {
  const pct = total ? (done / total) * 100 : 5;
  return (
    <Card className="mx-auto max-w-lg space-y-4 p-8 text-center">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
      <div>
        <p className="font-medium">{stage}</p>
        {total > 0 && (
          <p className="text-sm text-muted-foreground">
            {done} of {total} unique leads checked
          </p>
        )}
      </div>
      <Progress value={pct} />
    </Card>
  );
}
