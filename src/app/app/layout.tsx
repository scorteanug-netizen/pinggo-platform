import { redirect } from "next/navigation";
import { AppLayout } from "@/components/layout/AppLayout";
import { getCurrentUserAndWorkspace, isAuthBypassed } from "@/server/authMode";

export default async function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  const bypassed = isAuthBypassed();
  if (!context?.email) redirect("/login");

  return (
    <AppLayout email={context.email} bypassed={bypassed}>
      {children}
    </AppLayout>
  );
}
