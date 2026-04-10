import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { MobileNav } from "@/components/mobile-nav";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[18rem_1fr]">
      <AppSidebar />
      <div className="min-w-0">
        <MobileNav />
        <main className="space-y-8 px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
