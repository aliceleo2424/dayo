"use client";

import { Bell, Moon, Sun, User } from "lucide-react";
import Link from "next/link";
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
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/admin/dashboard" className="flex shrink-0 items-center">
          <img src="/images/logo.png" alt="DayO" className="h-8 w-auto max-w-[8rem] object-contain bg-transparent" />
          <span className="ml-2 inline-flex flex-col justify-center whitespace-nowrap border-l border-[#EDE4D5] pl-2 text-left leading-[1.15]">
            <span className="text-[10.5px] font-bold tracking-[-0.2px] text-[#57534E]">1:1 Global</span>
            <span className="text-[9.5px] font-medium tracking-[-0.3px] text-[#8C827A]">Communication Lounge</span>
          </span>
        </Link>
        <h1 className="truncate text-xl font-semibold text-navy">{title}</h1>
      </div>
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
