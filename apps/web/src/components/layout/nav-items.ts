import {
  LayoutDashboard,
  Film,
  Instagram,
  Scissors,
  UploadCloud,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/reels", label: "Reels", icon: Film },
  { to: "/instagram-accounts", label: "Socials", icon: Instagram },
  { to: "/clipping", label: "Clipping", icon: Scissors },
  { to: "/upload-queue", label: "Upload Queue", icon: UploadCloud },
  { to: "/settings", label: "Settings", icon: Settings },
];
