"use client";

import { AdminHeader } from "@/components/admin/header";
import { BookingMonitor } from "@/components/admin/booking-monitor";
import { PartnerPayoutManager } from "@/app/admin/partners/partner-payout-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TutorsPage() {
  return (
    <>
      <AdminHeader title="대화 파트너 & 클래스 관리" />
      <main className="p-6">
        <Tabs defaultValue="tutors">
          <TabsList>
            <TabsTrigger value="tutors">파트너 관리</TabsTrigger>
            <TabsTrigger value="bookings">세션 예약 모니터링</TabsTrigger>
            <TabsTrigger value="payouts">정산 · 포인트</TabsTrigger>
          </TabsList>

          <TabsContent value="tutors" className="mt-6">
            <PartnerPayoutManager />
          </TabsContent>

          <TabsContent value="bookings" className="mt-6">
            <BookingMonitor />
          </TabsContent>

          <TabsContent value="payouts" className="mt-6">
            <PartnerPayoutManager />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
