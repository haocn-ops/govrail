import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Building2,
  Bot,
  CircleCheckBig,
  Flag,
  ChartNoAxesColumn,
  Cable,
  FileStack,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  PlaySquare,
  Settings,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users
} from "lucide-react";

export type NavigationItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

export const navigationItems: NavigationItem[] = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    description: "Stats, health, and recent activity"
  },
  {
    title: "Onboarding",
    href: "/onboarding",
    icon: Sparkles,
    description: "Create workspace, bootstrap baseline, and meet first-run guidance"
  },
  {
    title: "Session",
    href: "/session",
    icon: ShieldCheck,
    description: "Current SaaS identity, workspace context, and accessible workspaces"
  },
  {
    title: "Verification",
    href: "/verification",
    icon: CircleCheckBig,
    description: "Week 8 onboarding, billing, and run-flow verification checklist"
  },
  {
    title: "Go-live Drill",
    href: "/go-live",
    icon: Flag,
    description: "Mock go-live rehearsal and evidence handoff checklist"
  },
  {
    title: "Admin",
    href: "/admin",
    icon: Building2,
    description: "Platform-level organizations, plans, and enterprise rollout posture"
  },
  {
    title: "Agents",
    href: "/agents",
    icon: Bot,
    description: "Lifecycle and capacity control"
  },
  {
    title: "Tasks",
    href: "/tasks",
    icon: Activity,
    description: "Execution status and queue depth"
  },
  {
    title: "Artifacts",
    href: "/artifacts",
    icon: FileStack,
    description: "Generated outputs and bundles"
  },
  {
    title: "Logs",
    href: "/logs",
    icon: TerminalSquare,
    description: "Live tail and searchable history"
  },
  {
    title: "Egress",
    href: "/egress",
    icon: Cable,
    description: "Outbound policy and destinations"
  },
  {
    title: "API Keys",
    href: "/api-keys",
    icon: KeyRound,
    description: "Credential rotation and scopes"
  },
  {
    title: "Service Accounts",
    href: "/service-accounts",
    icon: Fingerprint,
    description: "Machine identities for key ownership"
  },
  {
    title: "Members",
    href: "/members",
    icon: Users,
    description: "Workspace access and roles"
  },
  {
    title: "Usage",
    href: "/usage",
    icon: ChartNoAxesColumn,
    description: "Billing window, usage pressure, and plan feature posture"
  },
  {
    title: "Playground",
    href: "/playground",
    icon: PlaySquare,
    description: "Invoke and inspect agent flows"
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    description: "Workspace-level configuration"
  }
];
