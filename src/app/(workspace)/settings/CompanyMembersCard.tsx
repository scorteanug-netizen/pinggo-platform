"use client";

import { useState, useTransition } from "react";
import { MembershipRole } from "@prisma/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/ui/copy-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";

type MemberItem = {
  userId: string;
  email: string;
  name: string | null;
  role: MembershipRole;
  createdAt: string;
};

type CompanyMembersCardProps = {
  workspaceId: string;
  canInvite: boolean;
  members: MemberItem[];
};

const ROLE_OPTIONS: MembershipRole[] = ["OWNER", "ADMIN", "MANAGER", "AGENT"];

export function CompanyMembersCard({ workspaceId, canInvite, members }: CompanyMembersCardProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<MembershipRole>("AGENT");
  const [result, setResult] = useState<{ type: "idle" | "success" | "error"; message: string }>({
    type: "idle",
    message: "",
  });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult({ type: "idle", message: "" });
    setInviteLink(null);

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
    <SectionCard
      title="Membri companie"
      description="Lista membrilor din compania curenta."
      contentClassName="space-y-4"
    >
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Nume</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Adaugat</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-sm text-slate-500">
                    Nu exista membri in acest workspace.
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.userId} className="border-t border-slate-200">
                    <td className="px-3 py-2 text-slate-700">{member.name || "-"}</td>
                    <td className="px-3 py-2 text-slate-700">{member.email}</td>
                    <td className="px-3 py-2 text-slate-700">{member.role}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {new Date(member.createdAt).toLocaleDateString("ro-RO")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {canInvite ? (
          <form onSubmit={onSubmit} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">Invita utilizator</p>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="inviteEmail">Email</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  placeholder="utilizator@firma.ro"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="inviteName">Nume</Label>
                <Input
                  id="inviteName"
                  placeholder="Nume optional"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="inviteRole">Rol</Label>
                <select
                  id="inviteRole"
                  value={role}
                  onChange={(event) => setRole(event.target.value as MembershipRole)}
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/30"
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
                disabled={isPending}
                className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-70"
              >
                {isPending ? "Se trimite..." : "Trimite invitatie"}
              </Button>
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
        ) : (
          <p className="text-sm text-slate-600">
            Invitarea userilor se face din meniul Useri.
          </p>
        )}
    </SectionCard>
  );
}
