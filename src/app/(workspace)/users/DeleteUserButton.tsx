"use client";

import { MembershipStatus } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyField } from "@/components/ui/copy-field";

type UserLifecycleActionsProps = {
  userId: string;
  workspaceId: string;
  email: string;
  status: MembershipStatus;
  isCurrentUser?: boolean;
};

type LifecycleAction = "resend_invite" | "disable" | "enable" | "reset_password";

async function copyToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  return false;
}

export function UserLifecycleActions({
  userId,
  workspaceId,
  email,
  status,
  isCurrentUser = false,
}: UserLifecycleActionsProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generatedLinkLabel, setGeneratedLinkLabel] = useState("Link");
  const [isPending, startTransition] = useTransition();

  function runAction(action: LifecycleAction) {
    setErrorMessage("");
    setResultMessage("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, workspaceId }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            payload && typeof payload.error === "string"
              ? payload.error
              : "Nu am putut actualiza statusul userului.";
          setErrorMessage(message);
          return;
        }

        const inviteLink =
          payload && typeof payload.invite?.inviteLink === "string" ? payload.invite.inviteLink : null;
        const resetLink =
          payload && typeof payload.reset?.resetLink === "string" ? payload.reset.resetLink : null;
        const link = inviteLink ?? resetLink;

        if (link) {
          const shouldExposeInviteLink = !(inviteLink && payload?.invite?.delivery === "email");
          if (!shouldExposeInviteLink) {
            setGeneratedLink(null);
          } else {
            setGeneratedLink(link);
            setGeneratedLinkLabel(inviteLink ? "Link invitatie" : "Link resetare parola");
          }
          const copied = shouldExposeInviteLink ? await copyToClipboard(link) : false;
          if (inviteLink) {
            if (payload?.invite?.delivery === "email") {
              setResultMessage("Invitatia a fost retrimisa pe email.");
            } else {
              setResultMessage(copied ? "Linkul de invitatie a fost copiat." : "Linkul de invitatie este generat.");
            }
          } else {
            if (payload?.reset?.delivery === "email") {
              setResultMessage("Emailul de resetare a fost trimis.");
            } else {
              setResultMessage(copied ? "Linkul de resetare a fost copiat." : "Linkul de resetare este generat.");
            }
          }
        } else if (action === "disable") {
          setGeneratedLink(null);
          setResultMessage("Userul a fost dezactivat.");
        } else if (action === "enable") {
          setGeneratedLink(null);
          setResultMessage("Userul a fost activat.");
        } else {
          setResultMessage("Operatiunea a fost procesata.");
        }

        router.refresh();
      } catch {
        setErrorMessage("A aparut o eroare la actualizarea userului.");
      }
    });
  }

  if (isCurrentUser && status === "ACTIVE") {
    return <span className="text-xs text-slate-500">Cont curent</span>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {status === "INVITED" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => runAction("resend_invite")}
          >
            {isPending ? "Se retrimite..." : "Retrimite invitatie"}
          </Button>
        ) : null}

        {status === "ACTIVE" ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => runAction("reset_password")}
            >
              {isPending ? "Se genereaza..." : "Reset parola"}
            </Button>
            <ConfirmDialog
              title={`Dezactiveaza userul "${email}"`}
              description="Userul nu va mai avea acces pana la reactivare."
              confirmationText={email}
              triggerLabel={isPending ? "Se dezactiveaza..." : "Dezactiveaza"}
              confirmLabel="Dezactiveaza"
              pending={isPending}
              onConfirm={() => runAction("disable")}
              disabled={isCurrentUser}
            />
          </>
        ) : null}

        {status === "DISABLED" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800"
            disabled={isPending}
            onClick={() => runAction("enable")}
          >
            {isPending ? "Se activeaza..." : "Activeaza"}
          </Button>
        ) : null}
      </div>

      {resultMessage ? <p className="text-xs text-emerald-700">{resultMessage}</p> : null}
      {errorMessage ? <p className="text-xs text-rose-600">{errorMessage}</p> : null}

      {generatedLink ? (
        <CopyField
          label={generatedLinkLabel}
          value={generatedLink}
          className="max-w-xl"
          buttonLabel="Copiaza link"
          copiedLabel="Link copiat"
          toastMessage="Link copiat in clipboard"
        />
      ) : null}
    </div>
  );
}
