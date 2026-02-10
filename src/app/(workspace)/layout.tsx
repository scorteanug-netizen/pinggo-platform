import { redirect } from "next/navigation";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { getCurrentUserAndWorkspace, isAuthBypassed } from "@/server/authMode";

export default async function WorkspaceRouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getCurrentUserAndWorkspace().catch(() => null);
  if (!context?.email) redirect("/login");

  return (
    <WorkspaceLayout bypassed={isAuthBypassed()} permissions={context.permissions}>
      {children}
    </WorkspaceLayout>
  );
}
