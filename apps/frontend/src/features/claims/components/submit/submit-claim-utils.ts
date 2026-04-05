export type ExpenseCategory = "meals" | "transport" | "lodging" | "other";

export interface SubmitClaimFormValues {
  businessPurpose: string;
  claimedDate: string;
  expenseCategory: ExpenseCategory | "";
}

export const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"];
export const MAX_MB = 10;

export function validateReceiptFile(file: File): string | null {
  if (!ALLOWED_MIME.includes(file.type)) {
    return "Unsupported file type — please use JPG, PNG, or PDF.";
  }

  if (file.size > MAX_MB * 1024 * 1024) {
    return `File too large — maximum is ${MAX_MB} MB.`;
  }

  return null;
}
