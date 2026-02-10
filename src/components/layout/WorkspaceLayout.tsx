import Image from "next/image";
import type { PermissionSet } from "@/lib/rbac";
import { WorkspaceMobileNav, WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceTopbar } from "./WorkspaceTopbar";

type WorkspaceLayoutProps = {
  children: React.ReactNode;
  bypassed: boolean;
  permissions: PermissionSet;
};

export function WorkspaceLayout({ children, bypassed, permissions }: WorkspaceLayoutProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,86,33,0.08),_transparent_42%),linear-gradient(180deg,_#f8fafc_0%,_#f2f5f9_100%)] text-slate-900 md:grid md:grid-cols-[260px_1fr]">
      <WorkspaceSidebar permissions={permissions} />

      <div className="flex min-h-screen flex-col">
        <div className="border-b border-slate-200/80 bg-white/90 px-4 py-4 backdrop-blur md:hidden">
          <div className="mb-3">
            <Image
              src="/PINGGO_LOGO.png?v=2"
              alt="Pinggo"
              width={126}
              height={32}
              className="h-8 w-auto"
              priority
            />
          </div>
          <WorkspaceMobileNav permissions={permissions} />
        </div>

        <WorkspaceTopbar bypassed={bypassed} />

        <main className="flex-1 px-4 py-4 md:px-6 md:py-6">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
