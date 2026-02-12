"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ConfirmDialogProps = {
  title: string;
  description?: React.ReactNode;
  confirmationText: string;
  triggerLabel: React.ReactNode;
  triggerClassName?: string;
  disabled?: boolean;
  pending?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmDialog({
  title,
  description,
  confirmationText,
  triggerLabel,
  triggerClassName,
  disabled = false,
  pending = false,
  cancelLabel = "Anuleaza",
  confirmLabel = "Confirma",
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [typedValue, setTypedValue] = useState("");
  const confirmationInputId = useId();

  const isValid = useMemo(
    () => typedValue.trim() === confirmationText.trim(),
    [typedValue, confirmationText]
  );

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, pending]);

  useEffect(() => {
    if (!open) {
      setTypedValue("");
    }
  }, [open]);

  async function handleConfirm() {
    if (!isValid || pending) return;
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // Parent handlers surface actionable errors in-page.
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800",
          triggerClassName
        )}
        disabled={disabled || pending}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) {
              setOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.2)]">
            <div className="space-y-1 border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">{title}</h2>
              {description ? <p className="text-sm text-slate-600">{description}</p> : null}
            </div>

            <div className="space-y-2 px-5 py-4">
              <Label htmlFor={confirmationInputId}>
                Scrie exact <span className="font-mono font-semibold">{confirmationText}</span> pentru confirmare
              </Label>
              <Input
                id={confirmationInputId}
                value={typedValue}
                onChange={(event) => setTypedValue(event.target.value)}
                placeholder={confirmationText}
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                {cancelLabel}
              </Button>
              <Button
                type="button"
                disabled={!isValid || pending}
                onClick={handleConfirm}
                className="bg-rose-600 text-white shadow-none hover:bg-rose-700 disabled:opacity-60"
              >
                {pending ? "Se proceseaza..." : confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
