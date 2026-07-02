import type { ComponentType, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Shared loading/error placeholders for query-backed screens. */
export function LoadingCard({ label = "Loading…" }: { label?: string }) {
  return <Card><CardContent className="p-6 text-sm text-muted-foreground">{label}</CardContent></Card>;
}

export function ErrorCard({ message = "Something went wrong loading this data." }: { message?: string }) {
  return <Card><CardContent className="p-6 text-sm text-destructive">{message}</CardContent></Card>;
}

/** Friendly "this screen isn't part of your role" placeholder (e.g. payroll for broker). */
export function RoleNotAvailable({ what = "This screen", detail }: { what?: string; detail?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
        <div className="text-lg font-semibold">Not available for this role</div>
        <p className="max-w-md text-sm text-muted-foreground">
          {what} is managed at the employer level and isn't part of your workflow.
          {detail ? ` ${detail}` : ""}
        </p>
      </CardContent>
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[1.55rem] font-semibold leading-tight tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Icon = ComponentType<{ className?: string }>;
export type KpiItem = { label: string; value: ReactNode; tone?: string; icon?: Icon; iconClass?: string };

export function KpiRow({ items }: { items: KpiItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((k) => (
        <Card key={k.label}>
          <CardContent className="p-5">
            {k.icon && (
              <div className={cn("mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg", k.iconClass ?? "bg-primary/10 text-primary")}>
                <k.icon className="h-4 w-4" />
              </div>
            )}
            <div className={cn("text-[1.6rem] font-semibold leading-none tracking-tight", k.tone ?? "text-foreground")}>{k.value}</div>
            <div className="mt-1.5 text-xs font-medium text-muted-foreground">{k.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Lightly-tinted info/warning/danger banner. */
export function Banner({ tone = "info", children }: { tone?: "info" | "warning" | "danger" | "success"; children: ReactNode }) {
  const map: Record<string, string> = {
    info: "bg-info/10 text-info-foreground border-info/25",
    warning: "bg-warning/10 text-warning-foreground border-warning/30",
    danger: "bg-destructive/10 text-destructive border-destructive/25",
    success: "bg-success/10 text-success-foreground border-success/25",
  };
  return <div className={cn("flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm", map[tone])}>{children}</div>;
}

const toneMap: Record<string, string> = {
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/20 text-warning-foreground border-warning/40",
  info: "bg-info/15 text-info border-info/30",
  teal: "bg-teal/15 text-teal-foreground border-teal/30",
  danger: "bg-destructive/15 text-destructive border-destructive/30",
  muted: "bg-muted text-muted-foreground border-border",
};

/** Status pill with a coarse tone. Maps common status words to a tone. */
export function StatusPill({ label, tone }: { label: string; tone?: keyof typeof toneMap }) {
  const t = tone ?? inferTone(label);
  return <Badge variant="outline" className={toneMap[t]}>{label}</Badge>;
}

export function inferTone(label: string): keyof typeof toneMap {
  if (/complete|active|ready|approved|sent|current|eligible|paid|done/i.test(label)) return "success";
  if (/progress|pending|review|draft|open|new/i.test(label)) return "info";
  if (/attention|missing|warning|due|incomplete|not started/i.test(label)) return "warning";
  if (/blocked|error|overdue|failed|expired|rejected|ineligible/i.test(label)) return "danger";
  return "muted";
}
