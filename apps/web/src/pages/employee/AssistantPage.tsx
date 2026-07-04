// AI benefits assistant (Decision Support) — a grounded employee Q&A. Answers come
// from askBenefitsAssistant live (a real model grounded on the employee's own coverage
// facts + decision-support comparison) or a grounded mock in the employee shell demo.
import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBenefitsAssistant, type AssistantAnswerView } from "@/lib/api/operationsHooks";

const USAGE = [
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
] as const;

type Msg = { role: "user" | "assistant"; text: string };

export function AssistantPage() {
  // Employee shell is mock-context ("self"/null) → grounded mock answers; live callers
  // (real UUIDs + employeeId) hit the backend. Same seam as the comparison card.
  const assistant = useBenefitsAssistant("self", "self", null);
  const [usage, setUsage] = useState<"low" | "medium" | "high">("medium");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [meta, setMeta] = useState<Pick<AssistantAnswerView, "disclaimer" | "suggestedQuestions"> | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  const suggestions = meta?.suggestedQuestions ?? [
    "Which plan costs me the least overall?",
    "What's the deductible on the recommended plan?",
    "Which plans are HSA-eligible?",
    "How much would I pay per paycheck?",
  ];

  async function send(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setPending(true);
    try {
      const res = await assistant.ask(q, usage);
      setMeta({ disclaimer: res.disclaimer, suggestedQuestions: res.suggestedQuestions });
      setMessages((m) => [...m, { role: "assistant", text: res.answer }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "Sorry — I couldn't answer that just now. Please try again, or contact your HR team." }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Benefits Assistant" subtitle="Ask about your plan options — grounded in your own coverage and cost estimates" />

      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-card to-teal/5">
        <CardContent className="space-y-4 pt-5">
          {/* Usage selector — sets the assumed care level behind the cost estimates */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Estimate my costs for</span>
            {USAGE.map((u) => (
              <button
                key={u.key}
                type="button"
                onClick={() => setUsage(u.key)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  usage === u.key ? "border-primary bg-primary/10 font-medium text-primary" : "border-border bg-card text-muted-foreground hover:bg-accent"
                }`}
              >
                {u.label} usage
              </button>
            ))}
          </div>

          {/* Conversation */}
          <div className="min-h-[220px] space-y-3">
            {messages.length === 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/60 p-3 text-sm text-muted-foreground">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>Hi! I can compare your medical plans, explain deductibles and premiums, and point out the lowest-cost option for you. Ask me anything below.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                    m.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border border-border/60 bg-card"
                  }`}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm border border-border/60 bg-card px-3.5 py-2 text-sm text-muted-foreground">Thinking…</div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Suggested prompts */}
          {messages.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Composer */}
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about deductibles, premiums, HSA eligibility…"
              maxLength={500}
              aria-label="Ask the benefits assistant"
            />
            <Button type="submit" size="sm" disabled={pending || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>

          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {meta?.disclaimer ??
              "This assistant explains your options using your own plan data and cost estimates — it isn't medical, legal, or tax advice. For a decision or anything not covered here, check with your HR team."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
