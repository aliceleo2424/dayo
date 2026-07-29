"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, Ticket, Palette, GraduationCap,
  ChevronLeft, ChevronRight, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminStore } from "@/store/admin-store";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/admin/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/users", label: "회원 & CRM", icon: Users },
  { href: "/admin/users/automation", label: "CRM 자동화", icon: Zap, sub: true },
  { href: "/admin/promotions", label: "프로모션", icon: Ticket },
  { href: "/admin/cms", label: "프론트 CMS", icon: Palette },
  { href: "/admin/tutors", label: "대화 파트너 & 클래스", icon: GraduationCap },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAdminStore();

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 flex h-screen flex-col border-r bg-navy text-white transition-all duration-300",
      sidebarCollapsed ? "w-[68px]" : "w-64"
    )}>
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
        {!sidebarCollapsed && (
          <Link href="/admin/dashboard" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-coral text-sm font-bold">D</span>
            <span className="font-semibold">DayO Admin</span>
          </Link>
        )}
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="text-white hover:bg-white/10">
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {navItems.map(({ href, label, icon: Icon, sub }) => {
          let active = false;
          if (href === "/admin/users/automation") {
            active = pathname === href;
          } else if (href === "/admin/users") {
            active = pathname === href || (pathname.startsWith("/admin/users/") && pathname !== "/admin/users/automation");
          } else {
            active = pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(href + "/"));
          }
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                sub && "ml-3 py-2",
                active
                  ? "bg-coral text-white"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
      {!sidebarCollapsed && (
        <div className="border-t border-white/10 p-4 text-xs text-slate-400">
          DayO Marketing Admin v0.1
        </div>
      )}
    </aside>
  );
}
