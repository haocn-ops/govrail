import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Bot,
  Cable,
  FileStack,
  KeyRound,
  LayoutDashboard,
  PlaySquare,
  Settings,
  TerminalSquare
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
