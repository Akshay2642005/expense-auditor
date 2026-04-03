import { useClaimsApi } from "@/api/claims";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useActiveOrganizationReady } from "@/hooks/useActiveOrganizationReady";
import { cn } from "@/lib/utils";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useMutation } from "@tanstack/react-query";
import {
  Upload,
  FileText,
  Calendar,
  Tag,
  AlignLeft,
  CheckCircle,
  Clipboard,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type ExpenseCategory = "meals" | "transport" | "lodging" | "other";

interface FormValues {
  businessPurpose: string;
  claimedDate: string;
  expenseCategory: ExpenseCategory | "";
}

const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"];
const MAX_MB = 10;

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type)) {
    return "Unsupported file type — please use JPG, PNG, or PDF.";
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return `File too large — maximum is ${MAX_MB} MB.`;
  }
  return null;
}

export function SubmitClaimPage() {
  const { user } = useUser();
  const { orgRole, isLoaded: authLoaded } = useAuth();
  const navigate = useNavigate();
  const { submitClaim } = useClaimsApi();
  const { orgId, isWaitingForActivation: isWaitingForActiveOrg } =
    useActiveOrganizationReady();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      businessPurpose: "",
      claimedDate: "",
      expenseCategory: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      submitClaim({
        file: selectedFile!,
        businessPurpose: values.businessPurpose,
        claimedDate: values.claimedDate,
        expenseCategory: values.expenseCategory as ExpenseCategory,
      }),
    onSuccess: (data) => {
      toast.success("Claim submitted!", { description: data.message });
      navigate(`/claims/${data.claimId}`);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      toast.error("Submission failed", { description: msg });
    },
  });

  const applyFile = (file: File) => {
    const err = validateFile(file);
    if (err) {
      toast.error("Invalid file", { description: err });
      return;
    }
    setSelectedFile(file);
  };

  const flashPasteHint = () => {
    setPasteHint(true);
    setTimeout(() => setPasteHint(false), 1800);
  };

  // Ctrl+V / Cmd+V anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);

      const imageItem = items.find(
        (it) => it.kind === "file" && it.type.startsWith("image/"),
      );
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          applyFile(file);
          flashPasteHint();
        }
        return;
      }

      const fileItem = items.find((it) => it.kind === "file");
      if (fileItem) {
        const file = fileItem.getAsFile();
        if (file) {
          applyFile(file);
          flashPasteHint();
        }
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePasteButton = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith("image/"));
        if (imgType) {
          const blob = await item.getType(imgType);
          const file = new File([blob], `clipboard.${imgType.split("/")[1]}`, {
            type: imgType,
          });
          applyFile(file);
          flashPasteHint();
          return;
        }
      }
      toast.info("No image in clipboard", {
        description:
          "Copy an image first, then click this button or press Ctrl+V.",
      });
    } catch {
      toast.info(
        "Press Ctrl+V (or ⌘V) anywhere on this page to paste your receipt.",
      );
    }
  };

  const onSubmit = (values: FormValues) => {
    if (!selectedFile) {
      toast.error("Receipt required", {
        description:
          "Attach a receipt — drop a file, browse, or paste from clipboard.",
      });
      return;
    }
    mutation.mutate(values);
  };

  const today = new Date().toISOString().split("T")[0];

  if (!authLoaded || isWaitingForActiveOrg) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orgRole === "org:admin") {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-8">
        <div className="mx-auto max-w-xl space-y-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            ← Back to Review Queue
          </Button>

          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <AlertTriangle className="h-10 w-10 text-amber-500" />
              <div className="space-y-2">
                <p className="font-semibold">
                  Claim submission is disabled for admins
                </p>
                <p className="text-sm text-muted-foreground">
                  Admin accounts can review and audit member claims, but they
                  cannot upload reimbursement claims themselves.
                </p>
              </div>
              <Button onClick={() => navigate("/")}>Go to Claims Review</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!orgId || orgRole !== "org:member") {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-8">
        <div className="mx-auto max-w-xl space-y-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            ← Back
          </Button>

          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <AlertTriangle className="h-10 w-10 text-amber-500" />
              <div className="space-y-2">
                <p className="font-semibold">
                  Join an organization to submit claims
                </p>
                <p className="text-sm text-muted-foreground">
                  Expense submission requires an active organization membership
                  so the claim can be audited against the correct policy.
                </p>
              </div>
              <Button onClick={() => navigate("/")}>Back to Home</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Submit Expense
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hi {user?.firstName ?? "there"} — attach your receipt and describe
            the expense.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Receipt upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Upload className="h-4 w-4" />
                Receipt
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Drop zone */}
              <div
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors",
                  pasteHint
                    ? "border-primary bg-primary/10"
                    : dragOver
                      ? "border-primary bg-primary/5"
                      : selectedFile
                        ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                        : "border-muted-foreground/25 hover:border-primary/50",
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) applyFile(file);
                }}
              >
                {pasteHint ? (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Clipboard className="h-8 w-8 animate-bounce text-primary" />
                    <p className="text-sm font-medium text-primary">
                      Pasted from clipboard!
                    </p>
                  </div>
                ) : selectedFile ? (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <CheckCircle className="h-8 w-8 text-green-500" />
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(0)} KB — click to
                      replace
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm font-medium">
                      Drop receipt here or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG or PDF · max {MAX_MB} MB
                    </p>
                  </div>
                )}
              </div>

              {/* Paste button */}
              <button
                type="button"
                onClick={handlePasteButton}
                className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/30 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Clipboard className="h-3.5 w-3.5" />
                Paste from clipboard
                <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  Ctrl+V
                </span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) applyFile(file);
                }}
              />
            </CardContent>
          </Card>

          {/* Expense details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlignLeft className="h-4 w-4" />
                Expense Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="businessPurpose">Business Purpose</Label>
                <Textarea
                  id="businessPurpose"
                  placeholder="e.g. Client dinner with Acme Corp to discuss Q3 contract renewal"
                  className="min-h-[80px] resize-none"
                  {...register("businessPurpose", {
                    required: "Business purpose is required",
                    minLength: {
                      value: 10,
                      message: "Please provide at least 10 characters",
                    },
                    maxLength: {
                      value: 500,
                      message: "Must be 500 characters or fewer",
                    },
                  })}
                />
                {errors.businessPurpose && (
                  <p className="text-xs text-destructive">
                    {errors.businessPurpose.message}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="claimedDate"
                    className="flex items-center gap-1.5"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    Expense Date
                  </Label>
                  <Input
                    id="claimedDate"
                    type="date"
                    max={today}
                    {...register("claimedDate", {
                      required: "Please select the expense date",
                    })}
                  />
                  {errors.claimedDate && (
                    <p className="text-xs text-destructive">
                      {errors.claimedDate.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    Category
                  </Label>
                  <input
                    type="hidden"
                    {...register("expenseCategory", {
                      required: "Please select a category",
                      validate: (v) =>
                        ["meals", "transport", "lodging", "other"].includes(
                          v,
                        ) || "Please select a valid category",
                    })}
                  />
                  <Select
                    onValueChange={(v) =>
                      setValue("expenseCategory", v as ExpenseCategory, {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="meals">Meals</SelectItem>
                      <SelectItem value="transport">Transport</SelectItem>
                      <SelectItem value="lodging">Lodging</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.expenseCategory && (
                    <p className="text-xs text-destructive">
                      {errors.expenseCategory.message}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Submitting…" : "Submit Expense Claim"}
          </Button>
        </form>
      </div>
    </div>
  );
}
