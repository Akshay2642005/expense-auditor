import { useClaimsApi } from "@/api/claims";
import { Button } from "@/components/ui/button";
import { useActiveOrganizationReady } from "@/hooks/useActiveOrganizationReady";
import {
  ExpenseDetailsCard,
} from "@/features/claims/components/submit/ExpenseDetailsCard";
import { ReceiptUploadCard } from "@/features/claims/components/submit/ReceiptUploadCard";
import { SubmitClaimGuardCard } from "@/features/claims/components/submit/SubmitClaimGuardCard";
import type {
  ExpenseCategory,
  SubmitClaimFormValues,
} from "@/features/claims/components/submit/submit-claim-utils";
import { useReceiptSelection } from "@/features/claims/hooks/useReceiptSelection";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useMutation } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function SubmitClaimPage() {
  const { user } = useUser();
  const { orgRole, isLoaded: authLoaded } = useAuth();
  const navigate = useNavigate();
  const { submitClaim } = useClaimsApi();
  const { orgId, isWaitingForActivation: isWaitingForActiveOrg } =
    useActiveOrganizationReady();
  const {
    selectedFile,
    dragOver,
    setDragOver,
    pasteHint,
    fileInputRef,
    applyFile,
    handlePasteButton,
  } = useReceiptSelection();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SubmitClaimFormValues>({
    defaultValues: {
      businessPurpose: "",
      claimedDate: "",
      expenseCategory: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: SubmitClaimFormValues) =>
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
    onError: (error: unknown) => {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.";
      toast.error("Submission failed", { description: message });
    },
  });

  const onSubmit = (values: SubmitClaimFormValues) => {
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/admin/claims")}
          >
            ← Back to Review Queue
          </Button>

          <SubmitClaimGuardCard
            title="Claim submission is disabled for admins"
            description="Admin accounts can review and audit member claims, but they cannot upload reimbursement claims themselves."
            actionLabel="Go to Claims Review"
            onAction={() => navigate("/admin/claims")}
          />
        </div>
      </div>
    );
  }

  if (!orgId || orgRole !== "org:member") {
    return (
      <div className="min-h-screen bg-background p-4 sm:p-8">
        <div className="mx-auto max-w-xl space-y-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/claims")}>
            ← Back
          </Button>

          <SubmitClaimGuardCard
            title="Join an organization to submit claims"
            description="Expense submission requires an active organization membership so the claim can be audited against the correct policy."
            actionLabel="Back to Claims"
            onAction={() => navigate("/claims")}
          />
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
          <ReceiptUploadCard
            selectedFile={selectedFile}
            dragOver={dragOver}
            setDragOver={setDragOver}
            pasteHint={pasteHint}
            fileInputRef={fileInputRef}
            applyFile={applyFile}
            handlePasteButton={handlePasteButton}
          />

          <ExpenseDetailsCard
            register={register}
            setValue={setValue}
            errors={errors}
            today={today}
          />

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
