import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { validateReceiptFile } from "../components/submit/submit-claim-utils";

export function useReceiptSelection() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteHint, setPasteHint] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flashPasteHint = useCallback(() => {
    setPasteHint(true);
    setTimeout(() => setPasteHint(false), 1800);
  }, []);

  const applyFile = useCallback((file: File) => {
    const error = validateReceiptFile(file);
    if (error) {
      toast.error("Invalid file", { description: error });
      return;
    }

    setSelectedFile(file);
  }, []);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);

      const imageItem = items.find(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      );
      if (imageItem) {
        const file = imageItem.getAsFile();
        if (file) {
          applyFile(file);
          flashPasteHint();
        }
        return;
      }

      const fileItem = items.find((item) => item.kind === "file");
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
  }, [applyFile, flashPasteHint]);

  const handlePasteButton = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File(
            [blob],
            `clipboard.${imageType.split("/")[1]}`,
            { type: imageType },
          );
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
  }, [applyFile, flashPasteHint]);

  return {
    selectedFile,
    dragOver,
    setDragOver,
    pasteHint,
    fileInputRef,
    applyFile,
    handlePasteButton,
  };
}

