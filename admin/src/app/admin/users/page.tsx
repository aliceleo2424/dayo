"use client";

import { useState } from "react";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/header";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { users } from "@/lib/mockData";
import { LANGUAGE_LABELS, PAYMENT_LABELS, PURPOSE_LABELS, UTM_LABELS, type User } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { MessageSquare, Ticket } from "lucide-react";

export default function UsersPage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<"alimtalk" | "coupon" | null>(null);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const columns: Column<User & Record<string, unknown>>[] = [
    {
      key: "select", header: "",
      render: (row) => <Checkbox checked={selected.has(row.id as string)} onCheckedChange={() => toggleSelect(row.id as string)} />,
    },
    {
      key: "name", header: "회원", sortable: true,
      render: (row) => (
        <div>
          <Link href={`/admin/users/${row.id}`} className="font-medium text-coral hover:underline">{row.name as string}</Link>
          <p className="text-xs text-muted-foreground">{row.email as string}</p>
        </div>
      ),
    },
    { key: "purpose", header: "목적", sortable: true, render: (row) => PURPOSE_LABELS[row.purpose as keyof typeof PURPOSE_LABELS] },
    { key: "language", header: "언어", render: (row) => LANGUAGE_LABELS[row.language as keyof typeof LANGUAGE_LABELS] },
    { key: "utmSource", header: "UTM", render: (row) => UTM_LABELS[row.utmSource as keyof typeof UTM_LABELS] },
    {
      key: "testScore", header: "테스트", sortable: true,
      render: (row) => row.testCompleted ? <Badge variant="coral">{row.testScore}점</Badge> : <span className="text-muted-foreground">미완료</span>,
    },
    {
      key: "paymentStatus", header: "결제", sortable: true,
      render: (row) => {
        const s = row.paymentStatus as keyof typeof PAYMENT_LABELS;
        return <Badge variant={s === "paid" ? "success" : s === "unpaid" ? "warning" : "default"}>{PAYMENT_LABELS[s]}</Badge>;
      },
    },
    { key: "joinedAt", header: "가입일", sortable: true, render: (row) => formatDate(row.joinedAt as string) },
    {
      key: "actions", header: "CRM",
      render: (row) => (
        <Link href={`/admin/users/${row.id}`}>
          <Button variant="outline" size="sm">상세</Button>
        </Link>
      ),
    },
  ];

  const tableData = users as (User & Record<string, unknown>)[];

  return (
    <>
      <AdminHeader title="회원 & CRM 관리" />
      <main className="space-y-4 p-6">
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

        <DataTable
          data={tableData}
          columns={columns}
          searchKeys={["name", "email"]}
          filters={[
            { key: "purpose", label: "목적", options: Object.entries(PURPOSE_LABELS).map(([v, l]) => ({ value: v, label: l })) },
            { key: "language", label: "언어", options: Object.entries(LANGUAGE_LABELS).map(([v, l]) => ({ value: v, label: l })) },
            { key: "paymentStatus", label: "결제", options: Object.entries(PAYMENT_LABELS).map(([v, l]) => ({ value: v, label: l })) },
          ]}
          exportFilename="dayo-users.csv"
        />
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
    </>
  );
}
