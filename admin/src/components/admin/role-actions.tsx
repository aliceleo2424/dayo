"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { normalizeCrmRole } from "@/lib/admin-data";

export function RoleActions({
  role,
  busy,
  onApprove,
  onDemote,
}: {
  role: string | null | undefined;
  busy?: boolean;
  onApprove: () => void;
  onDemote: () => void;
}) {
  const normalized = normalizeCrmRole(role);

  if (normalized === "admin" || normalized === "super_admin" || normalized === "superadmin") {
    return (
      <Badge variant="admin" title="관리자 계정은 권한 변경이 보호됩니다.">
        관리자
      </Badge>
    );
  }

  if (normalized === "partner") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="success">파트너 활동중</Badge>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onDemote}>
          일반 유저로 강등
        </Button>
      </div>
    );
  }

  return (
    <Button type="button" variant="coral" size="sm" disabled={busy} onClick={onApprove}>
      ✨ 파트너 승인
    </Button>
  );
}
