"use client";

import { Bell, Moon, Sun, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminStore } from "@/store/admin-store";
import { cn } from "@/lib/utils";

export function AdminHeader({ title }: { title: string }) {
  const { darkMode, toggleDarkMode, sidebarCollapsed } = useAdminStore();

  return (
    <header className={cn(
      "sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60",
      sidebarCollapsed ? "ml-[68px]" : "ml-64"
    )}>
      <h1 className="text-xl font-semibold text-navy">{title}</h1>
      <div className="flex items-center gap-3">
        <Badge variant="coral">Super Admin</Badge>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-coral" />
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <div className="flex items-center gap-2 rounded-full border px-3 py-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-navy text-xs text-white">
            <User className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-medium">Alice</span>
        </div>
      </div>
    </header>
  );
}
