import { FileBarChart, Plug, Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusPill } from "@/components/common";

export function ReportsPage() {
  const reports = ["Census Export", "Enrollment Summary", "Payroll Deduction Report", "Carrier Discrepancy Report", "ACA 1095-C Audit", "COBRA Status Report"];
  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <PageHeader title="Reports" subtitle="Standard benefits administration reports" />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <Card key={r}>
            <CardContent className="flex items-center justify-between p-4">
              <span className="flex items-center gap-2 text-sm font-medium"><FileBarChart className="h-4 w-4 text-primary" />{r}</span>
              <Button size="sm" variant="outline">Run</Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function IntegrationsPage() {
  const integrations = [
    { name: "ADP", kind: "Payroll / Census", status: "Connected" },
    { name: "BambooHR", kind: "HRIS", status: "Connected" },
    { name: "QuickBooks", kind: "Accounting", status: "Connected" },
    { name: "Adobe Sign", kind: "E-Signature", status: "Connected" },
    { name: "UnitedHealthcare", kind: "Carrier EDI", status: "Active" },
  ];
  return (
    <div className="mx-auto max-w-[1000px] space-y-4">
      <PageHeader title="Integrations" subtitle="Payroll, HRIS, carriers, and e-signature" />
      <div className="grid gap-3 md:grid-cols-2">
        {integrations.map((i) => (
          <Card key={i.name}>
            <CardContent className="flex items-center justify-between p-4">
              <span className="flex items-center gap-2"><Plug className="h-4 w-4 text-primary" /><span><span className="text-sm font-medium">{i.name}</span><span className="ml-2 text-xs text-muted-foreground">{i.kind}</span></span></span>
              <StatusPill label={i.status} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-[900px] space-y-4">
      <PageHeader title="Settings" subtitle="Workspace and account configuration" />
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center justify-between text-base">Configuration <StatusPill label="Placeholder" tone="muted" /></CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Roles &amp; permissions, branding, notification preferences, and security settings — wired to the control-plane and Cognito later.
          </p>
          <div className="mt-3 flex items-center gap-2 text-muted-foreground"><SettingsIcon className="h-4 w-4" /><span className="text-sm">No settings to configure in the mock build.</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
