"use client";
import { useRef, useState } from "react";
import { FileSpreadsheet, Lock, Sparkles, Upload } from "lucide-react";
import { Button, Card } from "./ui";
import { cn } from "@/lib/utils";
import type { RunSummary } from "@/lib/db/types";

export function UploadStep({
  onFile,
  onSample,
  runs,
  onOpenRun,
  error,
}: {
  onFile: (f: File) => void;
  onSample: () => void;
  runs: RunSummary[];
  onOpenRun: (id: string) => void;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-semibold tracking-tight">Which of these leads are worth a credit?</h2>
        <p className="text-muted-foreground">
          Drop in a lead list from SaaSquatch, Apollo or Google Maps. We merge duplicates, verify emails, phones and websites, then rank every lead with
          the reasons behind its score.
        </p>
      </div>

      <Card
        className={cn("border-2 border-dashed p-10 text-center transition-colors", drag && "border-primary bg-primary/5")}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
      >
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Upload className="h-6 w-6" />
        </div>
        <p className="font-medium">Drag a CSV here</p>
        <p className="mb-5 text-sm text-muted-foreground">or</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => input.current?.click()}>
            <FileSpreadsheet className="h-4 w-4" /> Choose file
          </Button>
          <Button variant="outline" onClick={onSample}>
            <Sparkles className="h-4 w-4" /> Try with sample data
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        {error && <p className="mt-4 text-sm text-bad">{error}</p>}
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> Your file is read in the browser. Only the mapped columns are sent for verification.
        </p>
      </Card>

      {runs.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">Saved lists</h3>
          <Card className="divide-y divide-border">
            {runs.map((r) => (
              <button key={r.id} onClick={() => onOpenRun(r.id)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-muted">
                <span className="font-medium">{r.name}</span>
                <span className="text-muted-foreground">
                  {r.stats.leadsOut} leads · <span className="text-hot">{r.stats.hot} hot</span> · {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </button>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
