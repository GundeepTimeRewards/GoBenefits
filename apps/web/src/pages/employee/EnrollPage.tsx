import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/common";
import { DependentsSection } from "@/components/census/DependentsSection";
import { enrollSteps, myComparePlans, coverageTiers, myDependents } from "@/lib/employee-self-mock";

export function EnrollPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [planId, setPlanId] = useState(myComparePlans[0].id);
  const [tier, setTier] = useState("family");
  const [waived, setWaived] = useState(false);

  const plan = myComparePlans.find((p) => p.id === planId)!;
  const tierLabel = coverageTiers.find((t) => t.key === tier)?.label ?? "";

  const next = () => (step < enrollSteps.length - 1 ? setStep(step + 1) : navigate({ to: "/employee/enroll/confirm" }));
  const back = () => step > 0 && setStep(step - 1);

  return (
    <div className="space-y-4">
      <PageHeader title="Enroll — 2027 Benefits" subtitle="Open enrollment closes Nov 20, 2026" />

      {/* Stepper */}
      <div className="flex flex-wrap items-center gap-2">
        {enrollSteps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i < step ? "bg-success text-success-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {i < step ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={`text-xs ${i === step ? "font-medium" : "text-muted-foreground"}`}>{s}</span>
            {i < enrollSteps.length - 1 && <span className="mx-1 h-px w-4 bg-border" />}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">{enrollSteps[step]}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {step === 0 && <p className="text-sm text-muted-foreground">Review your personal information and confirm it's current before enrolling.</p>}

          {step === 1 && <DependentsSection dependents={myDependents} />}

          {step === 2 && (
            <div className="space-y-2">
              {myComparePlans.map((p) => (
                <button key={p.id} onClick={() => setPlanId(p.id)} className={`flex w-full items-center justify-between rounded-md border p-3 text-left ${planId === p.id ? "border-primary bg-primary/5" : "border-border/60"}`}>
                  <div>
                    <div className="text-sm font-medium">{p.name} {p.hsa && <Badge variant="outline" className="ml-1 bg-teal/15 text-teal-foreground border-teal/30 text-[10px]">HSA</Badge>}</div>
                    <div className="text-xs text-muted-foreground">{p.network} · Deductible {p.deductible} · OOP {p.oop}</div>
                  </div>
                  <div className="text-right"><div className="text-sm font-semibold">${p.perPay.toFixed(2)}</div><div className="text-[10px] text-muted-foreground">per pay</div></div>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {coverageTiers.map((t) => (
                  <button key={t.key} onClick={() => { setTier(t.key); setWaived(false); }} className={`rounded-md border px-3 py-2 text-sm ${tier === t.key && !waived ? "border-primary bg-primary/5 font-medium" : "border-border/60"}`}>{t.label}</button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={waived} onChange={(e) => setWaived(e.target.checked)} /> Waive medical coverage
              </label>
            </div>
          )}

          {step === 4 && <p className="text-sm text-muted-foreground">Add or confirm beneficiaries for your life coverage. (Allocations must total 100% — validated later.)</p>}

          {step === 5 && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Medical plan</span><span>{waived ? "Waived" : plan.name}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Coverage tier</span><span>{waived ? "—" : tierLabel}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Estimated per pay</span><span className="font-semibold">{waived ? "$0.00" : `$${plan.perPay.toFixed(2)}`}</span></div>
              <p className="pt-2 text-xs text-muted-foreground">Submitting records your <span className="font-medium">elections</span>. Active coverage is created on the effective date after HR review.</p>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button size="sm" variant="outline" onClick={back} disabled={step === 0}>Back</Button>
            <Button size="sm" onClick={next}>{step === enrollSteps.length - 1 ? "Submit Enrollment" : "Continue"}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
