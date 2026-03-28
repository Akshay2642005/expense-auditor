import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, FileText, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePolicyApi } from "@/api/policy";

export default function PolicyPage() {
  const navigate = useNavigate();
  const { getActivePolicy } = usePolicyApi();

  const { data: policy, isLoading } = useQuery({
    queryKey: ["policy", "active"],
    queryFn: getActivePolicy,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/80 px-6 py-4 backdrop-blur">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <ShieldCheck className="h-5 w-5 text-primary" />
        <span className="font-semibold text-sm">Expense Policy</span>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : !policy ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <XCircle className="h-8 w-8 text-muted-foreground/50" />
              <p className="font-medium text-sm">No active policy</p>
              <p className="text-xs text-muted-foreground">
                Your organization hasn't uploaded an expense policy yet. Contact your admin.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              <div className="min-w-0">
                <p className="font-medium text-sm">Active policy</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  This is the policy your expense claims are audited against.
                </p>
              </div>
            </div>

            <Card>
              <CardContent className="flex items-start gap-4 py-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
                  <FileText className="h-5 w-5 text-emerald-500" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-sm truncate">{policy.name}</p>
                  {policy.version && (
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {policy.version}
                    </span>
                  )}
                  <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
                    <span>
                      Uploaded {new Date(policy.createdAt).toLocaleDateString("en-US", {
                        month: "long", day: "numeric", year: "numeric",
                      })}
                    </span>
                    {policy.chunkCount > 0 && (
                      <span>{policy.chunkCount.toLocaleString()} sections indexed</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="text-center text-xs text-muted-foreground px-4">
              Contact your organization admin to update or replace this policy.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
