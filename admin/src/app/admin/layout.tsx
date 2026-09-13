"use client";

import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminAuthGuard } from "@/components/admin/auth-guard";
import { useAdminStore } from "@/store/admin-store";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, darkMode } = useAdminStore();

  return (
    <AdminAuthGuard>
      <div className={cn(darkMode && "dark")}>
        <AdminSidebar />
        <div className={cn("min-h-screen transition-all", sidebarCollapsed ? "ml-[68px]" : "ml-64")}>
          {children}
        </div>
      </div>
    </AdminAuthGuard>
  );
}
