"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Ticket, Palette, GraduationCap,
  ChevronLeft, ChevronRight, Zap, Newspaper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminStore } from "@/store/admin-store";
import { Button } from "@/components/ui/button";

const PARTNERS_HREF = "/admin/partners";

const navItems: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  sub?: boolean;
}[] = [
  { href: "/admin/dashboard", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/users", label: "회원 & CRM", icon: Users },
  { href: "/admin/users/automation", label: "CRM 자동화", icon: Zap, sub: true },
  { href: "/admin/promotions", label: "프로모션", icon: Ticket },
  { href: "/admin/cms", label: "프론트 CMS", icon: Palette },
  { href: "/admin/articles", label: "라운지 매거진", icon: Newspaper, sub: true },
  { href: PARTNERS_HREF, label: "대화 파트너 & 클래스", icon: GraduationCap },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar } = useAdminStore();

  function go(href: string, e: React.MouseEvent<HTMLAnchorElement>) {
    if (href !== PARTNERS_HREF) return;
    e.preventDefault();
    if (pathname === PARTNERS_HREF) {
      router.refresh();
      return;
    }
    router.push(PARTNERS_HREF);
  }

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 flex h-screen flex-col border-r bg-navy text-white transition-all duration-300",
      sidebarCollapsed ? "w-[68px]" : "w-64"
    )}>
      <div className="flex h-16 items-center justify-between gap-2 border-b border-white/10 px-3">
        {!sidebarCollapsed && (
          <Link href="/admin/dashboard" className="flex min-w-0 items-center bg-transparent">
            <img src="/images/logo.png" alt="DayO Admin" className="h-9 w-auto max-w-[10rem] object-contain bg-transparent" />
          </Link>
        )}
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className={cn("text-white hover:bg-white/10", sidebarCollapsed && "mx-auto")}>
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
          } else if (href === "/admin/articles") {
            active = pathname === href;
          } else if (href === "/admin/cms") {
            active = pathname === href;
          } else if (href === PARTNERS_HREF) {
            active = pathname === PARTNERS_HREF || pathname.startsWith(`${PARTNERS_HREF}/`);
          } else {
            active = pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(`${href}/`));
          }
          return (
            <Link
              key={href}
              href={href}
              prefetch
              onClick={(e) => go(href, e)}
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
          DayO 운영 어드민
        </div>
      )}
    </aside>
  );
}

export default AdminSidebar;
