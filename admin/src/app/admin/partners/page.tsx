"use client";

import { AdminHeader } from "@/components/admin/header";
import { PartnerPayoutManager } from "./partner-payout-manager";

export default function PartnersPage() {
  return (
    <>
      <AdminHeader title="파트너 정산" />
      <main className="p-6">
        <p className="mb-6 text-sm text-muted-foreground">
          파트너 행을 클릭하면 권한 변경과 포인트 정산을 할 수 있습니다.
        </p>
        <PartnerPayoutManager />
      </main>
    </>
  );
}
