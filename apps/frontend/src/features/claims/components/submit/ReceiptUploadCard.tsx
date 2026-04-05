import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CheckCircle, Clipboard, FileText, Upload } from "lucide-react";
import type { RefObject } from "react";

import { MAX_MB } from "./submit-claim-utils";

type ReceiptUploadCardProps = {
  selectedFile: File | null;
  dragOver: boolean;
  setDragOver: (value: boolean) => void;
  pasteHint: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  applyFile: (file: File) => void;
  handlePasteButton: () => void | Promise<void>;
};

export function ReceiptUploadCard({
  selectedFile,
  dragOver,
  setDragOver,
  pasteHint,
  fileInputRef,
  applyFile,
  handlePasteButton,
}: ReceiptUploadCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Upload className="h-4 w-4" />
          Receipt
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files[0];
            if (file) {
              applyFile(file);
            }
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
                {(selectedFile.size / 1024).toFixed(0)} KB — click to replace
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

        <Button
          type="button"
          variant="outline"
          onClick={handlePasteButton}
          className="flex w-full items-center justify-center gap-2 border-dashed text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <Clipboard className="h-3.5 w-3.5" />
          Paste from clipboard
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            Ctrl+V
          </span>
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              applyFile(file);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}

