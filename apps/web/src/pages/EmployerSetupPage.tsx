import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader, StatusPill } from "@/components/common";
import { LoadingCard } from "@/components/common";
import { useActiveEmployerId } from "@/lib/employer-context";
import { useEmployer } from "@/lib/api";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

export function EmployerSetupPage() {
  const { data: employer } = useEmployer(useActiveEmployerId());
  if (!employer) return <LoadingCard label="Loading employer setup…" />;
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <PageHeader title="Employer Setup" subtitle={employer.name} actions={<Button size="sm">Edit</Button>} />
      <Tabs defaultValue="company">
        <TabsList>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="locations">Locations &amp; Divisions</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="payroll">Payroll &amp; Tax</TabsTrigger>
          <TabsTrigger value="compliance">ACA / COBRA</TabsTrigger>
          <TabsTrigger value="plan-years">Plan Years</TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">Company Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Field label="Legal Name" value={employer.name} />
              <Field label="DBA" value={employer.name.split(" ")[0]} />
              <Field label="EIN / FEIN" value="74-1234567" />
              <Field label="Industry" value={employer.industry} />
              <Field label="Locations" value={String(employer.locations)} />
              <Field label="Renewal" value={employer.renewalMonth} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="space-y-4">
          <Card><CardHeader className="flex flex-row items-center justify-between pb-3"><CardTitle className="text-base">Locations</CardTitle><Button size="sm" variant="outline">Add Location</Button></CardHeader>
            <CardContent className="space-y-2">
              {["Dallas HQ — Dallas, TX", "Austin Office — Austin, TX", "Remote"].map((l) => (
                <div key={l} className="rounded-md border border-border/60 p-3 text-sm">{l}</div>
              ))}
            </CardContent>
          </Card>
          <Card><CardHeader className="flex flex-row items-center justify-between pb-3"><CardTitle className="text-base">Divisions / Classes</CardTitle><Button size="sm" variant="outline">Add Division</Button></CardHeader>
            <CardContent className="space-y-2">
              {["Operations", "Engineering", "Sales", "Corporate"].map((d) => (
                <div key={d} className="rounded-md border border-border/60 p-3 text-sm">{d}</div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts">
          <Card><CardHeader className="flex flex-row items-center justify-between pb-3"><CardTitle className="text-base">Contacts / HR Admins</CardTitle><Button size="sm" variant="outline">Add Contact</Button></CardHeader>
            <CardContent className="space-y-2">
              {[{ n: "Jamie Bennett", t: "HR Administrator (primary)", e: "jamie@acme.com" }, { n: "Priya Shah", t: "Benefits Coordinator", e: "priya@acme.com" }].map((c) => (
                <div key={c.n} className="flex items-center justify-between rounded-md border border-border/60 p-3">
                  <div><div className="text-sm font-medium">{c.n}</div><div className="text-xs text-muted-foreground">{c.t} · {c.e}</div></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll">
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">Payroll &amp; Tax</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <Field label="Default Pay Frequency" value="Biweekly (26)" />
              <Field label="Payroll Provider" value="ADP" />
              <Field label="QuickBooks Sync" value="Enabled" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="grid gap-4 md:grid-cols-2">
          <Card><CardHeader className="pb-3"><CardTitle className="text-base">ACA / ALE</CardTitle></CardHeader>
            <CardContent className="space-y-2"><Field label="ALE Status" value="Applicable Large Employer" /><Field label="Measurement Method" value="Look-back (12 mo)" /></CardContent>
          </Card>
          <Card><CardHeader className="pb-3"><CardTitle className="flex items-center justify-between text-base">COBRA Settings <StatusPill label="Placeholder" tone="muted" /></CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">COBRA administration settings (TPA, notice timing, grace period) — configured when the COBRA module ships.</p></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plan-years">
          <Card><CardContent className="p-4 text-sm text-muted-foreground">See the <span className="font-medium text-foreground">Plan Years</span> screen for setup and the readiness checklist.</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
