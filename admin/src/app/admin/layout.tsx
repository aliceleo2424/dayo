"use client";

import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminAuthGuard } from "@/components/admin/admin-auth-guard";
import { useAdminStore } from "@/store/admin-store";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, darkMode } = useAdminStore();
  const magazine = usePathname() === "/admin/articles";

  return (
    <AdminAuthGuard>
      <div className={cn(darkMode && "dark")}>
        <AdminSidebar />
        <div className={cn("min-h-screen transition-all", magazine
          ? sidebarCollapsed ? "min-w-0 ml-0 md:ml-[68px]" : "min-w-0 ml-0 md:ml-64"
          : sidebarCollapsed ? "ml-[68px]" : "ml-64")}>
          {children}
        </div>
      </div>
    </AdminAuthGuard>
  );
}
