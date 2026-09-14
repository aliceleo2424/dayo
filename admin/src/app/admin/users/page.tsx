"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/header";
import { DataTable, type Column } from "@/components/admin/data-table";
import { RoleActions } from "@/components/admin/role-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchCrmMembers, normalizeCrmRole, updateProfileRole, type CrmMember } from "@/lib/admin-data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { MessageSquare, Ticket } from "lucide-react";

const ROLE_FILTERS = [
  { value: "user", label: "user" },
  { value: "partner", label: "partner" },
  { value: "admin", label: "admin" },
];

const PAYMENT_FILTERS = [
  { value: "paid", label: "결제완료" },
  { value: "unpaid", label: "미결제" },
];

export default function UsersPage() {
  const [rows, setRows] = useState<CrmMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<"alimtalk" | "coupon" | null>(null);
  const [busyId, setBusyId] = useState("");
  const [toast, setToast] = useState<{ type: "ok" | "error"; message: string } | null>(null);

  function showToast(type: "ok" | "error", message: string) {
    setToast({ type, message });
    window.setTimeout(() => setToast(null), 3200);
  }

  function memberLabel(row: CrmMember) {
    return String(row.nickname || row.email || "회원").trim() || "회원";
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchCrmMembers();
      setRows(result.rows);
      setError(result.error);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "회원 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleRole(row: CrmMember, nextRole: "partner" | "user") {
    const label = memberLabel(row);
    const ok = window.confirm(
      nextRole === "partner"
        ? `${label}님을 대화 파트너로 승인하시겠습니까?`
        : `${label}님을 일반 유저로 강등하시겠습니까?`
    );
    if (!ok) return;

    const prevRole = row.role;
    setBusyId(row.id);
    setRows((cur) => cur.map((item) => (item.id === row.id ? { ...item, role: nextRole } : item)));
    try {
      await updateProfileRole(row, nextRole);
      showToast(
        "ok",
        nextRole === "partner"
          ? "성공적으로 파트너 권한이 부여되었습니다."
          : "일반 유저로 변경되었습니다."
      );
    } catch (err) {
      setRows((cur) => cur.map((item) => (item.id === row.id ? { ...item, role: prevRole } : item)));
      showToast("error", err instanceof Error ? err.message : "권한 변경에 실패했습니다.");
    } finally {
      setBusyId("");
    }
  }

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const columns: Column<CrmMember & Record<string, unknown>>[] = [
    {
      key: "select", header: "",
      render: (row) => <Checkbox checked={selected.has(row.id)} onCheckedChange={() => toggleSelect(row.id)} />,
    },
    {
      key: "name", header: "회원", sortable: true,
      render: (row) => (
        <div>
          <Link href={`/admin/users/${row.id}`} className="font-medium text-coral hover:underline">{row.name}</Link>
          <p className="text-xs text-muted-foreground">{row.email || "이메일 미등록"}</p>
        </div>
      ),
    },
    {
      key: "role", header: "권한", sortable: true,
      render: (row) => {
        const role = normalizeCrmRole(row.role);
        if (role === "admin" || role === "super_admin" || role === "superadmin") {
          return <Badge variant="admin">관리자</Badge>;
        }
        if (role === "partner") {
          return <Badge variant="success">파트너 활동중</Badge>;
        }
        return <Badge variant="default">user</Badge>;
      },
    },
    {
      key: "ticket_count", header: "보유 티켓", sortable: true,
      render: (row) => Number(row.ticket_count || 0),
    },
    {
      key: "point_balance", header: "적립 포인트", sortable: true,
      render: (row) => `${Number(row.point_balance || 0)} P`,
    },
    {
      key: "last_test_score", header: "테스트", sortable: true,
      render: (row) => row.last_test_score != null
        ? <Badge variant="coral">{row.last_test_score}점</Badge>
        : <span className="text-muted-foreground">미완료</span>,
    },
    {
      key: "paymentStatus", header: "결제", sortable: true,
      render: (row) => (
        <div>
          <Badge variant={row.paymentStatus === "paid" ? "success" : "warning"}>
            {row.paymentStatus === "paid" ? "결제완료" : "미결제"}
          </Badge>
          {row.totalSpent > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(row.totalSpent)}</p>
          )}
        </div>
      ),
    },
    {
      key: "created_at", header: "가입일", sortable: true,
      render: (row) => row.created_at ? formatDate(row.created_at) : "—",
    },
    {
      key: "actions", header: "CRM / 권한 관리",
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <RoleActions
            role={row.role}
            busy={busyId === row.id}
            onApprove={() => void toggleRole(row, "partner")}
            onDemote={() => void toggleRole(row, "user")}
          />
          <Link href={`/admin/users/${row.id}`}>
            <Button variant="outline" size="sm">상세</Button>
          </Link>
        </div>
      ),
    },
  ];

  const tableData = rows as (CrmMember & Record<string, unknown>)[];

  return (
    <>
      <AdminHeader title="회원 & CRM 관리" />
      <main className="space-y-4 p-6">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border bg-coral/5 px-4 py-3">
            <span className="text-sm font-medium">{selected.size}명 선택됨</span>
            <Button variant="coral" size="sm" onClick={() => setBulkModal("alimtalk")}>
              <MessageSquare className="mr-1 h-4 w-4" /> 일괄 알림톡
            </Button>
            <Button variant="outline" size="sm" onClick={() => setBulkModal("coupon")}>
              <Ticket className="mr-1 h-4 w-4" /> 일괄 쿠폰 지급
            </Button>
          </div>
        )}

        {loading ? (
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        ) : (
          <DataTable
            data={tableData}
            columns={columns}
            searchKeys={["name", "nickname", "user_name", "email"]}
            filters={[
              { key: "role", label: "role", options: ROLE_FILTERS },
              { key: "paymentStatus", label: "결제", options: PAYMENT_FILTERS },
            ]}
            exportFilename="dayo-users.csv"
            emptyMessage="아직 가입한 회원이 없습니다."
          />
        )}
      </main>

      <Dialog open={!!bulkModal} onOpenChange={() => setBulkModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bulkModal === "alimtalk" ? "일괄 알림톡 발송" : "일괄 쿠폰 지급"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">선택된 {selected.size}명에게 {bulkModal === "alimtalk" ? "알림톡" : "쿠폰"}을 발송합니다.</p>
            {bulkModal === "coupon" && (
              <div><Label>쿠폰 코드</Label><Input placeholder="WELCOME20" className="mt-1" /></div>
            )}
            <div><Label>메시지</Label><Input placeholder="메시지 내용을 입력하세요" className="mt-1" /></div>
            <Button variant="coral" className="w-full" onClick={() => setBulkModal(null)}>발송하기</Button>
          </div>
        </DialogContent>
      </Dialog>
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "error" ? "bg-red-600 text-white" : "bg-navy text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
