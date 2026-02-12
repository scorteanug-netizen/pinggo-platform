import Image from "next/image";
import { Button } from "@/components/ui/button";

type AppTopbarProps = {
  email: string;
  bypassed: boolean;
};

export function AppTopbar({ email, bypassed }: AppTopbarProps) {
  const displayEmail = email || "demo@pinggo.io";
  void bypassed;

  return (
    <header className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-8">
      <div className="flex items-center justify-end gap-2 md:gap-3">
        <span className="hidden text-sm font-medium text-slate-600 sm:inline">
          {displayEmail}
        </span>
        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-extrabold text-orange-700">
          {bypassed ? "Demo mode" : "Conectat"}
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white">
          <Image src="/PINGGO_LOGO.png?v=2" alt="Pinggo" width={26} height={26} className="h-6 w-6 object-contain" />
        </span>
        <form action="/auth/logout" method="POST">
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            className="text-slate-600 hover:text-slate-900"
          >
            Deconectare
          </Button>
        </form>
      </div>
    </header>
  );
}
