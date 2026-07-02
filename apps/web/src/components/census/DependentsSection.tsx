import { Users, AlertCircle, GraduationCap, Accessibility } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ageFromDob, type Dependent } from "@/lib/census-mock";

const relationshipLabel: Record<string, string> = {
  spouse: "Spouse",
  child: "Child",
  domestic_partner: "Domestic Partner",
  other: "Other",
};

const coveredTone: Record<string, string> = {
  covered: "bg-success/15 text-success border-success/30",
  not_covered: "bg-muted text-muted-foreground border-border",
  pending: "bg-warning/20 text-warning-foreground border-warning/40",
};

function dependentMissingInfo(d: Dependent): string[] {
  const m: string[] = [];
  if (!d.dateOfBirth) m.push("Missing date of birth");
  if (!d.relationship) m.push("Missing relationship");
  return m;
}

/** Reusable dependents list (detail page / drawer). No SSN is ever shown. */
export function DependentsSection({ dependents }: { dependents: Dependent[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> Dependents
          <span className="text-xs font-normal text-muted-foreground">({dependents.length})</span>
        </CardTitle>
        <Button size="sm" variant="outline">Add Dependent</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {dependents.length === 0 && (
          <p className="text-sm text-muted-foreground">No dependents on file.</p>
        )}
        {dependents.map((d) => {
          const age = ageFromDob(d.dateOfBirth);
          const missing = dependentMissingInfo(d);
          return (
            <div key={d.dependentId} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/60 p-3">
              <div className="min-w-[140px] flex-1">
                <div className="text-sm font-medium">{d.firstName} {d.lastName}</div>
                <div className="text-xs text-muted-foreground">{relationshipLabel[d.relationship] ?? d.relationship}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {d.dateOfBirth ?? "—"}{age !== null ? ` · ${age} yrs` : ""}
              </div>
              {d.gender && <span className="text-xs text-muted-foreground">{d.gender}</span>}
              {d.student && (
                <Badge variant="outline" className="gap-1 text-[10px]"><GraduationCap className="h-3 w-3" /> Student</Badge>
              )}
              {d.disabled && (
                <Badge variant="outline" className="gap-1 text-[10px]"><Accessibility className="h-3 w-3" /> Disabled</Badge>
              )}
              {d.coveredStatus && (
                <Badge variant="outline" className={`text-[10px] ${coveredTone[d.coveredStatus]}`}>
                  {d.coveredStatus === "covered" ? "Covered" : d.coveredStatus === "pending" ? "Pending" : "Not covered"}
                </Badge>
              )}
              {missing.length > 0 && (
                <Badge variant="outline" className="gap-1 border-warning/40 bg-warning/15 text-[10px] text-warning-foreground">
                  <AlertCircle className="h-3 w-3" /> {missing.length} issue{missing.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
