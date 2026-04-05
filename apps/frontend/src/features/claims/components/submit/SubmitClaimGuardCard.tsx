import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

type SubmitClaimGuardCardProps = {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
};

export function SubmitClaimGuardCard({
  title,
  description,
  actionLabel,
  onAction,
}: SubmitClaimGuardCardProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <div className="space-y-2">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={onAction}>{actionLabel}</Button>
      </CardContent>
    </Card>
  );
}

