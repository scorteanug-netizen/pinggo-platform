"use client";

import { MembershipRole } from "@prisma/client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WorkspaceOption = {
  id: string;
  name: string;
};

type InviteUserFormProps = {
  workspaces: WorkspaceOption[];
};

const ROLE_OPTIONS: MembershipRole[] = ["ADMIN", "MANAGER", "AGENT"];

export function InviteUserForm({ workspaces }: InviteUserFormProps) {
  const router = useRouter();
  const hasWorkspaces = workspaces.length > 0;
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [role, setRole] = useState<MembershipRole>("AGENT");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ type: "idle" | "success" | "error"; message: string }>({
    type: "idle",
    message: "",
  });
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult({ type: "idle", message: "" });
    setInviteLink(null);

    if (!hasWorkspaces || !workspaceId) {
      setResult({ type: "error", message: "Selecteaza o companie." });
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/invite-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim(),
            name: name.trim() || undefined,
            role,
            workspaceId,
          }),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            payload && typeof payload.error === "string"
              ? payload.error
              : "Nu am putut trimite invitatia.";
          setResult({ type: "error", message });
          return;
        }

        const generatedInviteLink =
          payload && typeof payload.invite?.inviteLink === "string" ? payload.invite.inviteLink : null;
        setInviteLink(payload?.invite?.delivery === "email" ? null : generatedInviteLink);
        if (payload?.invite?.delivery === "email") {
          setResult({ type: "success", message: "Invitatia a fost trimisa pe email." });
        } else {
          setResult({ type: "success", message: "Invitatia a fost generata. Copiaza linkul." });
        }
        setEmail("");
        setName("");
        setRole("AGENT");
        router.refresh();
      } catch {
        setResult({ type: "error", message: "A aparut o eroare la trimiterea invitatiei." });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="inviteEmail">Email</Label>
          <Input
            id="inviteEmail"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="utilizator@firma.ro"
            disabled={!hasWorkspaces}
            required
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="inviteName">Nume</Label>
          <Input
            id="inviteName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nume optional"
            disabled={!hasWorkspaces}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="inviteWorkspace">Companie</Label>
          <select
            id="inviteWorkspace"
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200"
            disabled={!hasWorkspaces}
            required
          >
            {!hasWorkspaces ? <option value="">Creeaza mai intai o companie</option> : null}
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="inviteRole">Rol</Label>
          <select
            id="inviteRole"
            value={role}
            onChange={(event) => setRole(event.target.value as MembershipRole)}
            className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200"
            disabled={!hasWorkspaces}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="submit"
          disabled={isPending || !hasWorkspaces}
          className="bg-orange-500 text-white hover:bg-orange-600"
        >
          {isPending ? "Se trimite..." : "Invita user"}
        </Button>
        {!hasWorkspaces ? (
          <p className="text-sm text-slate-600">Nu exista companii. Creeaza intai o companie.</p>
        ) : null}
        {result.type !== "idle" ? (
          <p className={result.type === "success" ? "text-sm text-emerald-600" : "text-sm text-rose-600"}>
            {result.message}
          </p>
        ) : null}
      </div>

      {inviteLink ? (
        <CopyField
          label="Link invitatie"
          value={inviteLink}
          buttonLabel="Copiaza link"
          copiedLabel="Link copiat"
          toastMessage="Link invitatie copiat in clipboard"
        />
      ) : null}
    </form>
  );
}
