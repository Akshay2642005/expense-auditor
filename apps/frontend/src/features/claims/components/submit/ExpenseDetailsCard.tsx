import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlignLeft, Calendar, Tag } from "lucide-react";
import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";

import type {
  ExpenseCategory,
  SubmitClaimFormValues,
} from "./submit-claim-utils";

type ExpenseDetailsCardProps = {
  register: UseFormRegister<SubmitClaimFormValues>;
  setValue: UseFormSetValue<SubmitClaimFormValues>;
  errors: FieldErrors<SubmitClaimFormValues>;
  today: string;
};

export function ExpenseDetailsCard({
  register,
  setValue,
  errors,
  today,
}: ExpenseDetailsCardProps) {
  return (
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
            <Label htmlFor="claimedDate" className="flex items-center gap-1.5">
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
                validate: (value) =>
                  ["meals", "transport", "lodging", "other"].includes(value) ||
                  "Please select a valid category",
              })}
            />
            <Select
              onValueChange={(value) =>
                setValue("expenseCategory", value as ExpenseCategory, {
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
  );
}
