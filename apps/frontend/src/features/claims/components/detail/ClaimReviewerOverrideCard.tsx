import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AuditDecisionStatus } from "@auditor/zod";
import { RefreshCw } from "lucide-react";
import { getDecisionToneClass } from "./claim-detail-utils";

export function ClaimReviewerOverrideCard({
  overrideDecision,
  overrideReason,
  overrideLoading,
  onDecisionChange,
  onReasonChange,
  onSave,
}: {
  overrideDecision: AuditDecisionStatus;
  overrideReason: string;
  overrideLoading: boolean;
  onDecisionChange: (decision: AuditDecisionStatus) => void;
  onReasonChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <Card className="flex flex-col overflow-hidden border-amber-500/20 bg-card/95 shadow-sm">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-lg">Reviewer Override</CardTitle>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Finalize the human decision when the automated outcome needs a manual
          adjustment or escalation note.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col space-y-4 pt-5">
        <div className="grid gap-4">
          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/[0.18] p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Final Decision
            </p>
            <div className="flex flex-wrap gap-2">
              {(["approved", "flagged", "rejected"] as const).map((decision) => (
                <Button
                  key={decision}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onDecisionChange(decision)}
                  className={cn(
                    "rounded-full border px-4 capitalize",
                    overrideDecision === decision
                      ? getDecisionToneClass(decision)
                      : "border-border/60 bg-background text-foreground hover:bg-muted/40",
                  )}
                >
                  {decision}
                </Button>
              ))}
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Saving creates a new manual review record and immediately updates
              the claim status shown to the employee.
            </p>
          </div>

          <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/[0.18] p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Reviewer Comment
            </p>
            <Textarea
              value={overrideReason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Explain why this claim should be approved, flagged, or rejected."
              className="min-h-[16rem] resize-y border-border/60 bg-background xl:min-h-[15.8rem]"
              maxLength={1000}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Minimum 10 characters required.</span>
              <span>{overrideReason.trim().length}/1000</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 px-3.5 py-3">
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Use overrides for clear human review decisions. The original AI
            audit is retained for traceability and later analysis.
          </p>
          <Button
            type="button"
            onClick={onSave}
            disabled={overrideLoading || overrideReason.trim().length < 10}
            className="gap-2"
          >
            {overrideLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : null}
            Save Reviewer Decision
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
