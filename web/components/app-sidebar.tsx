"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { navigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-72 flex-col border-r border-border bg-background px-5 py-6 lg:flex">
      <div className="mb-8 flex items-center gap-3 px-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-sm font-semibold text-foreground">
          GR
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Govrail</p>
          <p className="text-xs text-muted">Governed agent ops</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-2">
        {navigationItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group rounded-2xl border px-3 py-3 transition",
                active
                  ? "border-border bg-card text-foreground"
                  : "border-transparent text-muted hover:border-border hover:bg-card hover:text-foreground",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl border border-border bg-background p-2">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs leading-5 text-muted group-hover:text-muted">{item.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Production surface</p>
        <p className="mt-2 text-sm font-medium text-foreground">Next.js on Workers</p>
        <p className="mt-1 text-xs leading-5 text-muted">
          Govrail runs as a dedicated console on OpenNext and Cloudflare Workers, fronting the production API.
        </p>
      </div>
    </aside>
  );
}
