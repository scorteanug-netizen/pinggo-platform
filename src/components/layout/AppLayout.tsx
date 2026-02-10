import Image from "next/image";
import { AppSidebar, MobileNav } from "./AppSidebar";
import { AppTopbar } from "./AppTopbar";

type AppLayoutProps = {
  children: React.ReactNode;
  email: string;
  bypassed: boolean;
};

export function AppLayout({ children, email, bypassed }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-[#f4f6f8] text-slate-900 md:grid md:grid-cols-[260px_1fr]">
      <AppSidebar />

      <div className="flex min-h-screen flex-col">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 md:hidden">
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
          <MobileNav />
        </div>

        <AppTopbar email={email} bypassed={bypassed} />

        <main className="flex-1 px-4 py-5 md:px-8 md:py-7">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
