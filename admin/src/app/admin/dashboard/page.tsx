"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AdminHeader } from "@/components/admin/header";
import { DashboardKpis } from "@/components/admin/dashboard-kpis";
import { BookingMonitor } from "@/components/admin/booking-monitor";
import { PartnerPayoutManager } from "@/app/admin/partners/partner-payout-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function DashboardTabs() {
  const search = useSearchParams();
  const tab = search.get("tab") === "bookings" ? "bookings" : "partners";

  return (
    <Tabs defaultValue={tab} key={tab}>
      <TabsList>
        <TabsTrigger value="partners">파트너 관리</TabsTrigger>
        <TabsTrigger value="bookings">세션 예약 모니터링</TabsTrigger>
      </TabsList>
      <TabsContent value="partners" className="mt-6">
        <PartnerPayoutManager />
      </TabsContent>
      <TabsContent value="bookings" className="mt-6">
        <BookingMonitor />
      </TabsContent>
    </Tabs>
  );
}

export default function DashboardPage() {
  return (
    <>
      <AdminHeader title="종합 대시보드" />
      <main className="space-y-6 p-6">
        <DashboardKpis />
        <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" />}>
          <DashboardTabs />
        </Suspense>
      </main>
    </>
  );
}
