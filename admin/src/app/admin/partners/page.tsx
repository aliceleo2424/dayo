"use client";

import { AdminHeader } from "@/components/admin/header";
import { PartnerPayoutManager } from "./partner-payout-manager";

export default function PartnersPage() {
  return (
    <>
      <AdminHeader title="파트너 정산" />
      <main className="p-6">
        <p className="mb-6 text-sm text-muted-foreground">
          파트너를 클릭하면 활동 통계와 10일 정산 입금 처리를 할 수 있습니다.
        </p>
        <PartnerPayoutManager />
      </main>
    </>
  );
}
