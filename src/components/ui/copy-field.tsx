"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CopyFieldProps = {
  value: string;
  copyValue?: string;
  label?: string;
  className?: string;
  buttonLabel?: string;
  copiedLabel?: string;
  toastMessage?: string;
};

async function writeToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

export function CopyField({
  value,
  copyValue,
  label,
  className,
  buttonLabel = "Copiaza",
  copiedLabel = "Copiat",
  toastMessage = "Copiat in clipboard",
}: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  async function handleCopy() {
    try {
      await writeToClipboard(copyValue ?? value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input readOnly value={value} className="font-mono text-xs text-slate-700" />
        <Button type="button" variant="outline" onClick={handleCopy} className="shrink-0">
          {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
          {copied ? copiedLabel : buttonLabel}
        </Button>
      </div>

      {copied ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 shadow-[0_6px_24px_rgba(15,23,42,0.12)]"
        >
          {toastMessage}
        </div>
      ) : null}
    </div>
  );
}

