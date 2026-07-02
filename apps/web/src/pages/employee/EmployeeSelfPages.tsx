import { Link } from "@tanstack/react-router";
import { CalendarClock, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatusPill } from "@/components/common";
import { DependentsSection } from "@/components/census/DependentsSection";
import { myProfile, myBenefits, myDependents, myDocuments, myLifeEvents } from "@/lib/employee-self-mock";

export function MyBenefitsPage() {
  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-5 w-5 text-primary" />
            <div>
              <div className="text-sm font-medium">{myProfile.planYearLabel} — Open Enrollment</div>
              <div className="text-xs text-muted-foreground">{myProfile.enrollmentWindow} · Effective {myProfile.effectiveDate} · {myProfile.daysLeft} days left</div>
            </div>
          </div>
          <Button asChild size="sm"><Link to="/employee/enroll">Continue Enrollment <ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
        </CardContent>
      </Card>

      <PageHeader title="My Benefits" subtitle={`${myProfile.name} · ${myProfile.employerName}`} />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Coverage</TableHead><TableHead>Plan</TableHead><TableHead>Tier</TableHead><TableHead className="text-right">Per Pay</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {myBenefits.map((b) => (
              <TableRow key={b.line}>
                <TableCell className="font-medium">{b.line}</TableCell>
                <TableCell className="text-sm">{b.plan ?? "—"}</TableCell>
                <TableCell className="text-sm">{b.tier ?? "—"}</TableCell>
                <TableCell className="text-right text-sm">{b.perPay === null ? "Pending" : `$${b.perPay.toFixed(2)}`}</TableCell>
                <TableCell><StatusPill label={b.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

export function MyElectionsPage() {
  const selected = myBenefits.filter((b) => b.status === "Selected" || b.status === "Employer Paid");
  return (
    <div className="space-y-4">
      <PageHeader title="My Elections" subtitle={`${myProfile.planYearLabel} · effective ${myProfile.effectiveDate}`} />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Coverage</TableHead><TableHead>Plan</TableHead><TableHead>Tier</TableHead><TableHead className="text-right">Per Pay</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {selected.map((b) => (
              <TableRow key={b.line}>
                <TableCell className="font-medium">{b.line}</TableCell>
                <TableCell className="text-sm">{b.plan ?? "—"}</TableCell>
                <TableCell className="text-sm">{b.tier ?? "—"}</TableCell>
                <TableCell className="text-right text-sm">{b.perPay === null ? "Pending" : `$${b.perPay.toFixed(2)}`}</TableCell>
                <TableCell><StatusPill label={b.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

export function MyDependentsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="My Dependents" subtitle="People you can cover under your benefits" />
      <DependentsSection dependents={myDependents} />
    </div>
  );
}

export function MyDocumentsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="My Documents" subtitle="Plan documents and your confirmations" />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Category</TableHead><TableHead>Date</TableHead><TableHead className="w-20" /></TableRow></TableHeader>
          <TableBody>
            {myDocuments.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell><StatusPill label={d.category} tone="muted" /></TableCell>
                <TableCell className="text-sm text-muted-foreground">{d.date}</TableCell>
                <TableCell><Button size="sm" variant="ghost">Download</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

export function MyLifeEventsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="My Life Events" subtitle="Report a qualifying life event to change coverage" actions={<Button asChild size="sm"><Link to="/employee/life-events/report">Report a Life Event</Link></Button>} />
      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Event Date</TableHead><TableHead>Documents</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {myLifeEvents.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium">{e.type}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.date}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{e.documents}</TableCell>
                <TableCell><StatusPill label={e.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

export function HelpPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Help" subtitle="Questions about your benefits or enrollment" />
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Get support</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Contact your HR administrator or benefits team for help with elections, dependents, or documents.</p>
          <p>During open enrollment, most changes can be made yourself under <span className="font-medium text-foreground">Enroll</span> until the window closes.</p>
          <div className="pt-2"><Button size="sm" variant="outline">Contact HR</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ConfirmationPage() {
  return (
    <div className="space-y-4">
      <Card className="border-success/30 bg-success/5">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base text-success">Enrollment Submitted <Badge variant="outline" className="bg-success/15 text-success border-success/30">Confirmed</Badge></CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Your 2027 elections have been submitted. A confirmation has been added to <span className="font-medium text-foreground">My Documents</span>. You can make changes until the window closes on Nov 20, 2026.</p>
          <div className="mt-3 flex gap-2">
            <Button asChild size="sm"><Link to="/employee">Back to My Benefits</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/employee/documents">View Confirmation</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
