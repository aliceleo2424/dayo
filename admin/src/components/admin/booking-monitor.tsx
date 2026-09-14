"use client";

import { useEffect, useState } from "react";
import { fetchBookings, type BookingRow } from "@/lib/admin-data";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/admin/data-table";

const statusLabel: Record<string, string> = {
  pending: "대기",
  confirmed: "확정",
  completed: "완료",
  cancelled: "취소",
};

export function BookingMonitor() {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchBookings()
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setError(result.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const columns: Column<BookingRow & Record<string, unknown>>[] = [
    {
      key: "scheduled_at",
      header: "예약 일시",
      sortable: true,
      render: (row) => row.scheduled_at ? formatDateTime(String(row.scheduled_at)) : "미정",
    },
    { key: "learner_nickname", header: "유저 닉네임", sortable: true },
    { key: "partner_nickname", header: "파트너 닉네임", sortable: true },
    {
      key: "status",
      header: "상태",
      render: (row) => {
        const status = String(row.status || "pending");
        return <Badge variant={status === "completed" ? "success" : status === "cancelled" ? "warning" : "default"}>{statusLabel[status] || status}</Badge>;
      },
    },
    {
      key: "room_url",
      header: "세션룸",
      render: (row) => (
        <a href={String(row.room_url)} target="_blank" rel="noopener noreferrer" className="font-medium text-coral hover:underline">
          입장 링크
        </a>
      ),
    },
  ];

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!rows.length) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <p className="text-lg font-semibold">현재 예정된 세션 예약이 없습니다 ☕</p>
          <p className="mt-2 text-sm text-muted-foreground">예약이 생성되면 일시, 닉네임, 세션룸 링크가 여기에 표시됩니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <DataTable
      data={rows as (BookingRow & Record<string, unknown>)[]}
      columns={columns}
      searchKeys={["learner_nickname", "partner_nickname", "status"]}
      exportFilename="bookings.csv"
    />
  );
}
