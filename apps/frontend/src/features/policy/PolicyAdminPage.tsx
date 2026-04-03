import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, useUser } from "@clerk/clerk-react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
  Archive,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { usePolicyApi } from "@/api/policy";
import type { Policy, PolicyStatus } from "@auditor/zod";
import { useActiveOrganizationReady } from "@/hooks/useActiveOrganizationReady";

const POLL_MS = 10000;

const STATUS_META: Record<
  PolicyStatus,
  { label: string; icon: React.ReactNode; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pending: { label: "Pending", icon: <Clock className="h-3 w-3" />, variant: "secondary" },
  ingesting: { label: "Ingesting", icon: <Loader2 className="h-3 w-3 animate-spin" />, variant: "default" },
  active: { label: "Active", icon: <CheckCircle2 className="h-3 w-3" />, variant: "default" },
  failed: { label: "Failed", icon: <XCircle className="h-3 w-3" />, variant: "destructive" },
  archived: { label: "Archived", icon: <Archive className="h-3 w-3" />, variant: "outline" },
};

const TERMINAL: PolicyStatus[] = ["active", "failed", "archived"];

function isTerminal(status: PolicyStatus) {
  return TERMINAL.includes(status);
}

function PolicyRow({ policy, isLatest }: { policy: Policy; isLatest: boolean }) {
  const meta = STATUS_META[policy.status] ?? STATUS_META.pending;
  const isIngesting = policy.status === "pending" || policy.status === "ingesting";

  const date = new Date(policy.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      className={[
        "group relative flex items-start gap-4 rounded-xl border p-4 transition-colors",
        isLatest ? "border-border bg-card" : "border-border/50 bg-card/50 opacity-80",
      ].join(" ")}
    >
      <div
        className={[
          "mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
          policy.status === "active"
            ? "bg-emerald-500/10 text-emerald-500"
            : policy.status === "failed"
              ? "bg-destructive/10 text-destructive"
              : policy.status === "archived"
                ? "bg-muted text-muted-foreground"
                : "bg-primary/10 text-primary",
        ].join(" ")}
      >
        <FileText className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-sm">{policy.name}</span>
          {policy.version && (
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground">
              {policy.version}
            </span>
          )}
          {isLatest && policy.status === "active" && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-medium text-emerald-500">
              CURRENT
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>{date}</span>
          {policy.chunkCount > 0 && (
            <span>{policy.chunkCount.toLocaleString()} chunks</span>
          )}
        </div>
        {isIngesting && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Ingestion in progress — this can take a few minutes.
          </div>
        )}
      </div>

      <Badge variant={meta.variant} className="flex-shrink-0 items-center gap-1 text-[11px]">
        {meta.icon}
        {meta.label}
      </Badge>
    </div>
  );
}

function UploadForm({ onUploaded }: { onUploaded: (p: Policy) => void }) {
  const { uploadPolicy } = usePolicyApi();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [version, setVersion] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (f.type !== "application/pdf") {
      toast.error("Only PDF files are accepted.");
      return;
    }
    setFile(f);
    if (!name) setName(f.name.replace(/\.pdf$/i, ""));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [name] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSubmit = async () => {
    if (!file || !name.trim()) {
      toast.error("Please select a file and enter a name.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name.trim());
      fd.append("version", version.trim());
      const policy = await uploadPolicy(fd);
      toast.success("Policy uploaded — ingestion started.");
      onUploaded(policy);
      setFile(null);
      setName("");
      setVersion("");
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Upload failed. Try again.";
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={[
          "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : file
              ? "border-emerald-500/50 bg-emerald-500/5"
              : "border-border hover:border-primary/50 hover:bg-muted/30",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
              <FileText className="h-6 w-6 text-emerald-500" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">{file.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); }}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
              <Upload className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">Drop your PDF here</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                or click to browse — max 20 MB
              </p>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="policy-name" className="text-xs font-medium">
            Policy name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="policy-name"
            placeholder="Travel & Expense Policy"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="policy-version" className="text-xs font-medium">
            Version{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="policy-version"
            placeholder="v2.1"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
        </div>
      </div>

      <Button className="w-full gap-2" onClick={handleSubmit} disabled={uploading || !file}>
        {uploading ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</>
        ) : (
          <><Upload className="h-4 w-4" /> Upload & Ingest Policy</>
        )}
      </Button>
    </div>
  );
}

export default function PolicyAdminPage() {
  const navigate = useNavigate();
  const { orgRole } = useAuth();
  const { user } = useUser();
  const { listPolicies, getPolicy, getActivePolicyDownloadUrl } = usePolicyApi();
  const {
    orgId: activeOrgId,
    isReady: isActiveOrgReady,
    isWaitingForActivation: isWaitingForActiveOrg,
  } = useActiveOrganizationReady();

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingActivePolicy, setOpeningActivePolicy] = useState(false);

  useEffect(() => {
    if (orgRole !== undefined && orgRole !== "org:admin") {
      navigate("/", { replace: true });
    }
  }, [orgRole, navigate]);

  const fetchPolicies = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const list = await listPolicies();
      setPolicies(list);
    } catch {
      toast.error("Failed to load policies.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [listPolicies]);

  useEffect(() => {
    if (!isActiveOrgReady) return;
    fetchPolicies();
  }, [fetchPolicies, isActiveOrgReady, activeOrgId]);

  const handlePoll = useCallback(async (id: string) => {
    try {
      const updated = await getPolicy(id);
      setPolicies((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (isTerminal(updated.status)) {
        if (updated.status === "active") {
          toast.success(`Policy "${updated.name}" is now active.`);
        } else if (updated.status === "failed") {
          toast.error(`Policy "${updated.name}" ingestion failed.`);
        }
      }
    } catch { /* ignore poll errors */ }
  }, [getPolicy]);

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    const inProgress = policies.filter(
      (p) => p.status === "pending" || p.status === "ingesting"
    );

    if (inProgress.length === 0) return;

    const tick = async () => {
      if (document.visibilityState === "hidden") {
        pollTimerRef.current = setTimeout(tick, POLL_MS);
        return;
      }
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        await Promise.all(inProgress.map((p) => handlePoll(p.id)));
      } finally {
        pollInFlightRef.current = false;
      }
      pollTimerRef.current = setTimeout(tick, POLL_MS);
    };

    pollTimerRef.current = setTimeout(tick, POLL_MS);

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [policies, handlePoll]);

  const handleUploaded = (p: Policy) => {
    setPolicies((prev) => [p, ...prev]);
  };

  const handleViewActivePolicy = async () => {
    setOpeningActivePolicy(true);
    try {
      const url = await getActivePolicyDownloadUrl();
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Failed to open the active policy.");
    } finally {
      setOpeningActivePolicy(false);
    }
  };

  const activePolicy = policies.find((p) => p.status === "active");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">Policy Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {user?.primaryEmailAddress?.emailAddress}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => fetchPolicies(true)}
            disabled={refreshing}
          >
            <RefreshCw className={["h-4 w-4", refreshing ? "animate-spin" : ""].join(" ")} />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
        {isWaitingForActiveOrg && (
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your organization policy workspace…
          </div>
        )}

        {/* Active policy callout */}
        {!isWaitingForActiveOrg && activePolicy && (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/80 dark:text-emerald-300/80">
                Active policy
              </p>
              <p className="mt-1 truncate font-semibold text-sm">{activePolicy.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {activePolicy.version && (
                  <span>
                    Policy number{" "}
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                      {activePolicy.version}
                    </span>
                  </span>
                )}
                <span>
                  {activePolicy.chunkCount.toLocaleString()} chunks indexed
                </span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleViewActivePolicy}
              disabled={openingActivePolicy}
            >
              {openingActivePolicy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              View PDF
            </Button>
          </div>
        )}

        {/* Upload section */}
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold text-base">Upload new policy</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Uploading a new policy will automatically make it active and archive the current one.
              Gemini will extract the text and generate vector embeddings for all chunks.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <UploadForm onUploaded={handleUploaded} />
          </div>
        </section>

        <Separator />

        {/* Policy history */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">Policy history</h2>
            <span className="text-xs text-muted-foreground">
              {policies.length} {policies.length === 1 ? "policy" : "policies"}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : policies.length === 0 ? (
            <div className="rounded-xl border border-dashed py-12 text-center">
              <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium text-muted-foreground">No policies yet</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Upload your first expense policy PDF above.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {policies.map((p, i) => (
                <PolicyRow key={p.id} policy={p} isLatest={i === 0} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
