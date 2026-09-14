"use client";

import { useEffect, useState } from "react";
import { Users, GraduationCap, CalendarCheck, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchDashboardKpis, type DashboardKpis } from "@/lib/admin-data";
import { formatCurrency } from "@/lib/utils";

const cards = [
  { key: "memberCount" as const, label: "총 가입 회원", icon: Users, format: (n: number) => n.toLocaleString("ko-KR") },
  { key: "partnerCount" as const, label: "등록된 파트너", icon: GraduationCap, format: (n: number) => n.toLocaleString("ko-KR") },
  { key: "completedSessions" as const, label: "진행/완료 세션", icon: CalendarCheck, format: (n: number) => n.toLocaleString("ko-KR") },
  { key: "paidAmount" as const, label: "누적 결제액", icon: Wallet, format: (n: number) => formatCurrency(n) },
];

export function DashboardKpis() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchDashboardKpis()
      .then((data) => {
        if (!cancelled) setKpis(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = kpis ? card.format(kpis[card.key]) : "—";
        return (
          <Card key={card.key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
              ) : (
                <div className="text-2xl font-bold">{value}</div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
