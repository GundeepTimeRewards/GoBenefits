import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatusPill } from "@/components/common";
import { eligibilityClasses, contributionRules } from "@/lib/app-mock";

export function EligibilityPage() {
  return (
    <div className="mx-auto max-w-[1150px] space-y-4">
      <PageHeader title="Eligibility & Contributions" subtitle="2027 Benefits" actions={<Button size="sm">Add Class</Button>} />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Eligibility Classes</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Class</TableHead><TableHead>Criteria</TableHead><TableHead>Waiting Period</TableHead>
              <TableHead>Coverages</TableHead><TableHead className="text-center">Employees</TableHead><TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {eligibilityClasses.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.criteria}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.waiting}</TableCell>
                  <TableCell className="text-sm">{c.coverages}</TableCell>
                  <TableCell className="text-center text-sm">{c.employees}</TableCell>
                  <TableCell><StatusPill label={c.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Employer Contribution Rules</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Class</TableHead><TableHead>Medical</TableHead><TableHead>Dental</TableHead><TableHead>Vision</TableHead><TableHead>Life</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {contributionRules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.class}</TableCell>
                  <TableCell className="text-sm">{r.medical}</TableCell>
                  <TableCell className="text-sm">{r.dental}</TableCell>
                  <TableCell className="text-sm">{r.vision}</TableCell>
                  <TableCell className="text-sm">{r.life}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
