import { cn } from "@/lib/utils";

export function SummaryTile({
  icon: Icon,
  label,
  value,
  toneClass,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  toneClass?: string;
}) {
  return (
    <div className="grid min-h-[118px] grid-cols-[minmax(0,1fr)_44px] gap-4 rounded-2xl border border-border/60 bg-muted/[0.18] p-4">
      <div className="min-w-0 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </p>
        <div
          className={cn(
            "min-w-0 text-sm font-medium leading-relaxed text-foreground",
            toneClass,
          )}
        >
          {value}
        </div>
      </div>
      <div className="flex h-11 w-11 items-center justify-center self-start rounded-xl border border-border/60 bg-card text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" />
      </div>
    </div>
  );
}

export function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6">
      <dt className="pt-0.5 text-sm text-muted-foreground">{label}</dt>
      <dd className="max-w-[62%] break-words text-right text-sm font-medium leading-relaxed text-foreground">
        {value}
      </dd>
    </div>
  );
}
