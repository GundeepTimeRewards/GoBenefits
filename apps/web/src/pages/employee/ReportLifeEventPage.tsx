import type { ComponentType } from "react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Heart, HeartCrack, Baby, ShieldOff, ShieldCheck, UserX, Cake, MapPin, Briefcase, HelpCircle,
  Check, ArrowLeft, ArrowRight, Save, Send, Upload, CheckCircle2, Info, Lock, Plus, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/common";
import { reportLifeEventSteps, lifeEventTypes, myDependents, myProfile, type LifeEventTypeDef } from "@/lib/employee-self-mock";

type Icon = ComponentType<{ className?: string }>;
const ICONS: Record<string, Icon> = {
  heart: Heart, "heart-crack": HeartCrack, baby: Baby, "shield-off": ShieldOff, "shield-check": ShieldCheck,
  "user-x": UserX, cake: Cake, "map-pin": MapPin, briefcase: Briefcase, "help-circle": HelpCircle,
};

const depName = (id: string) => {
  const d = myDependents.find((x) => x.dependentId === id);
  return d ? `${d.firstName} ${d.lastName}` : id;
};

export function ReportLifeEventPage() {
  const [step, setStep] = useState(0);
  const [eventKey, setEventKey] = useState<string | null>(null);
  const [eventDate, setEventDate] = useState("");
  const [notes, setNotes] = useState("");
  const [priorEnd, setPriorEnd] = useState("");
  const [newStart, setNewStart] = useState("");
  const [people, setPeople] = useState<string[]>(["employee"]);
  const [addedDependent, setAddedDependent] = useState(false);
  const [uploaded, setUploaded] = useState<Record<string, boolean>>({});
  const [ack, setAck] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const def: LifeEventTypeDef | undefined = eventKey ? lifeEventTypes.find((t) => t.key === eventKey) : undefined;
  const estEffective = eventDate ? "First of the month following the event" : "TBD after review";
  const affected = [
    ...people.map((p) => (p === "employee" ? myProfile.name : depName(p))),
    ...(addedDependent ? ["New dependent (to be added)"] : []),
  ];
  const docsUploaded = def ? def.docs.filter((d) => uploaded[d]).length : 0;

  const canContinue = step === 0 ? !!eventKey : step === 4 ? ack : true;
  const isLast = step === reportLifeEventSteps.length - 1;
  const next = () => (isLast ? setSubmitted(true) : setStep((s) => s + 1));
  const back = () => step > 0 && setStep((s) => s - 1);
  const togglePerson = (id: string) => setPeople((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  if (submitted) return <SubmittedView def={def} />;

  return (
    <div className="space-y-4">
      <Link to="/employee/life-events" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Life Events
      </Link>
      <PageHeader title="Report Life Event" subtitle="Tell us what changed so we can determine whether you can update your benefits." />

      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-2">
        {reportLifeEventSteps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i < step ? "bg-success text-success-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={`text-xs ${i === step ? "font-medium" : "text-muted-foreground"}`}>{s}</span>
            {i < reportLifeEventSteps.length - 1 && <span className="mx-1 hidden h-px w-4 bg-border sm:block" />}
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main step column */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{reportLifeEventSteps[step]}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {step === 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {lifeEventTypes.map((t) => {
                    const EvIcon = ICONS[t.iconKey] ?? HelpCircle;
                    const active = eventKey === t.key;
                    return (
                      <button key={t.key} type="button" onClick={() => setEventKey(t.key)}
                        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition hover:bg-muted/40 ${active ? "border-primary bg-primary/5 ring-1 ring-primary/10" : "border-border"}`}>
                        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><EvIcon className="h-4 w-4" /></div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{t.name}</div>
                          <div className="text-xs text-muted-foreground">{t.description}</div>
                        </div>
                        {active && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Event date"><Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="h-9" /></Field>
                    {def?.key === "loss-coverage" && <Field label="Prior coverage end date"><Input type="date" value={priorEnd} onChange={(e) => setPriorEnd(e.target.value)} className="h-9" /></Field>}
                    {def?.key === "gain-coverage" && <Field label="New coverage start date"><Input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="h-9" /></Field>}
                  </div>
                  <Field label="Short explanation / notes">
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add any details that help us understand your request…" className="h-24 w-full resize-none rounded-md border bg-background p-2 text-sm" />
                  </Field>
                  {def?.deadlineDays && (
                    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      This event may need to be reported within {def.deadlineDays} days of the event date.
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Select the people affected by this event.</p>
                  <PersonRow label={myProfile.name} sub="Employee (you)" checked={people.includes("employee")} onToggle={() => togglePerson("employee")} />
                  {myDependents.map((d) => (
                    <PersonRow key={d.dependentId} label={`${d.firstName} ${d.lastName}`} sub={d.relationship === "spouse" ? "Spouse" : "Child"} checked={people.includes(d.dependentId)} onToggle={() => togglePerson(d.dependentId)} />
                  ))}
                  {def?.people === "add_dependent" && (
                    <button type="button" onClick={() => setAddedDependent((v) => !v)}
                      className={`flex w-full items-center gap-2 rounded-md border border-dashed p-3 text-sm ${addedDependent ? "border-primary bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}>
                      <Plus className="h-4 w-4" />{addedDependent ? "New dependent will be added (mock)" : "Add a new dependent"}
                    </button>
                  )}
                  {def?.people === "select_dependent" && <p className="text-xs text-muted-foreground">Select the existing dependent this event applies to.</p>}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  {(!def || def.docs.length === 0) ? (
                    <p className="text-sm text-muted-foreground">No documents are required for this event type. HR may still request more during review.</p>
                  ) : (
                    def.docs.map((d) => (
                      <div key={d} className="flex items-center justify-between gap-3 rounded-md border p-3">
                        <div className="flex items-center gap-2 text-sm">
                          {uploaded[d] ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Upload className="h-4 w-4 text-muted-foreground" />}
                          <span>{d}</span>
                        </div>
                        <Button size="sm" variant={uploaded[d] ? "outline" : "default"} onClick={() => setUploaded((u) => ({ ...u, [d]: !u[d] }))}>
                          {uploaded[d] ? "Uploaded" : "Upload"}
                        </Button>
                      </div>
                    ))
                  )}
                  <div className="flex items-start gap-2 rounded-md border border-info/30 bg-info/5 p-3 text-xs text-muted-foreground">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                    Documents are used only to verify your request and are stored securely.
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4 text-sm">
                  <ReviewRow label="Event type" value={def?.name ?? "—"} />
                  <ReviewRow label="Event date" value={eventDate || "—"} />
                  <ReviewRow label="Affected people" value={affected.join(", ") || "—"} />
                  <ReviewRow label="Documents" value={def && def.docs.length ? `${docsUploaded} of ${def.docs.length} uploaded` : "None required"} />
                  <ReviewRow label="Estimated effective date" value={estEffective} />
                  <ReviewRow label="Requested benefit changes" value="Determined after HR review" />
                  <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Estimated effective date is subject to HR review and plan rules.
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
                    <span>I confirm the information above is accurate and understand this request is subject to HR review.</span>
                  </label>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={back} disabled={step === 0}><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm"><Save className="mr-1.5 h-4 w-4" />Save Draft</Button>
              {isLast ? (
                <Button size="sm" disabled={!canContinue} onClick={next}><Send className="mr-1.5 h-4 w-4" />Submit Request</Button>
              ) : (
                <Button size="sm" disabled={!canContinue} onClick={next}>Continue <ArrowRight className="ml-1.5 h-4 w-4" /></Button>
              )}
            </div>
          </div>
        </div>

        {/* Right-side panels */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Request Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <SummaryLine label="Event type" value={def?.name ?? "Not selected"} />
              <SummaryLine label="Event date" value={eventDate || "—"} />
              <SummaryLine label="Est. effective date" value={estEffective} />
              <SummaryLine label="Affected people" value={affected.length ? String(affected.length) : "—"} />
              <SummaryLine label="Changes selected" value="After review" />
              <SummaryLine label="Documents" value={def && def.docs.length ? `${docsUploaded} / ${def.docs.length}` : "None required"} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">What happens next?</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-muted-foreground">
                {[
                  "HR reviews your request and documents.",
                  "If approved, your election window opens.",
                  "You make updated benefit elections.",
                  "Payroll and carriers are updated, if applicable.",
                ].map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary">{i + 1}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>{children}</div>;
}
function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 border-b border-border/50 py-1.5 last:border-0"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{label}</span><span className="text-right text-xs font-medium">{value}</span></div>;
}
function PersonRow({ label, sub, checked, onToggle }: { label: string; sub: string; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className={`flex w-full items-center gap-3 rounded-md border p-3 text-left ${checked ? "border-primary bg-primary/5" : "border-border/60"}`}>
      <span className={`flex h-5 w-5 items-center justify-center rounded border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{checked && <Check className="h-3 w-3" />}</span>
      <div><div className="text-sm font-medium">{label}</div><div className="text-xs text-muted-foreground">{sub}</div></div>
    </button>
  );
}

function SubmittedView({ def }: { def: LifeEventTypeDef | undefined }) {
  return (
    <div className="mx-auto max-w-[640px] space-y-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success"><CheckCircle2 className="h-6 w-6" /></div>
          <div className="text-lg font-semibold">Life event request submitted</div>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your {def?.name ?? "life event"} request has been submitted for HR review. We'll notify you if we need anything else or once your election window opens.
          </p>
          <Badge variant="outline" className="bg-info/15 text-info border-info/30">Status: Under Review</Badge>
          <div className="mt-2 flex gap-2">
            <Button asChild size="sm"><Link to="/employee/life-events">View my life events <ChevronRight className="ml-1 h-4 w-4" /></Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
