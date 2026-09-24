"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/admin/header";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";

type CouponRow = Record<string, unknown> & {
  id: string;
  user_id: string | null;
  client_key: string | null;
  code: string;
  title: string | null;
  discount_price: number;
  original_price: number;
  is_used: boolean;
  created_at: string;
  used_at: string | null;
};

type PromoCodeRow = Record<string, unknown> & {
  code: string;
  influencer: string;
  platform: string;
  signups: number;
  conversions: number;
  revenue: number;
};

type ReferralRow = Record<string, unknown> & {
  referrerName: string;
  referredName: string;
  rewardAmount: number;
  rewardGiven: boolean;
  createdAt: string;
};

const promoCodes: PromoCodeRow[] = [];
const referralRecords: ReferralRow[] = [];

export default function PromotionsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [couponsError, setCouponsError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadCoupons() {
      const result = await supabase
        .from("coupons")
        .select("id,user_id,client_key,code,title,discount_price,original_price,is_used,created_at,used_at")
        .order("created_at", { ascending: false });

      if (!active) return;
      if (result.error) {
        setCoupons([]);
        setCouponsError("쿠폰 목록을 불러오지 못했습니다.");
      } else {
        setCoupons((result.data || []) as CouponRow[]);
        setCouponsError("");
      }
      setCouponsLoading(false);
    }

    void loadCoupons();
    return () => {
      active = false;
    };
  }, []);

  const couponColumns: Column<CouponRow>[] = [
    { key: "title", header: "쿠폰명", sortable: true, render: (row) => row.title || "—" },
    { key: "code", header: "코드", sortable: true, render: (row) => <Badge variant="coral">{row.code}</Badge> },
    { key: "discount_price", header: "할인가", render: (row) => formatCurrency(row.discount_price) },
    { key: "original_price", header: "정상가", render: (row) => formatCurrency(row.original_price) },
    {
      key: "is_used",
      header: "사용 상태",
      render: (row) => <Badge variant={row.is_used ? "default" : "success"}>{row.is_used ? "사용 완료" : "미사용"}</Badge>,
    },
    { key: "created_at", header: "발급일", sortable: true, render: (row) => formatDate(row.created_at) },
    { key: "used_at", header: "사용일", render: (row) => row.used_at ? formatDate(row.used_at) : "—" },
  ];

  const promoColumns: Column<PromoCodeRow>[] = [
    { key: "code", header: "제휴 코드", sortable: true },
    { key: "influencer", header: "인플루언서", sortable: true },
    { key: "platform", header: "플랫폼" },
    { key: "signups", header: "가입", sortable: true },
    { key: "conversions", header: "전환", sortable: true },
    { key: "revenue", header: "매출", render: (row) => formatCurrency(row.revenue) },
  ];

  const referralColumns: Column<ReferralRow>[] = [
    { key: "referrerName", header: "초대자", sortable: true },
    { key: "referredName", header: "피초대자" },
    { key: "rewardAmount", header: "보상", render: (row) => formatCurrency(row.rewardAmount) },
    {
      key: "rewardGiven",
      header: "지급",
      render: (row) => <Badge variant={row.rewardGiven ? "success" : "warning"}>{row.rewardGiven ? "완료" : "대기"}</Badge>,
    },
    { key: "createdAt", header: "일시", render: (row) => formatDate(row.createdAt) },
  ];

  return (
    <>
      <AdminHeader title="프로모션 & 쿠폰" />
      <main className="p-6">
        <Tabs defaultValue="coupons">
          <TabsList>
            <TabsTrigger value="coupons">쿠폰 생성</TabsTrigger>
            <TabsTrigger value="promo">제휴 코드</TabsTrigger>
            <TabsTrigger value="referral">친구 초대</TabsTrigger>
          </TabsList>

          <TabsContent value="coupons" className="mt-6 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>쿠폰 생성기</CardTitle>
                <p className="text-sm text-muted-foreground">쿠폰 생성 기능은 정식 오픈 후 사용할 수 있어요.</p>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div><Label>쿠폰명</Label><Input placeholder="쿠폰명" className="mt-1" disabled /></div>
                <div><Label>쿠폰 코드</Label><Input placeholder="쿠폰 코드" className="mt-1" disabled /></div>
                <div><Label>할인 방식</Label>
                  <Select defaultValue="percent" disabled><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="percent">정률 (%)</SelectItem><SelectItem value="fixed">정액 (₩)</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>할인 값</Label><Input type="number" placeholder="할인 값" className="mt-1" disabled /></div>
                <div><Label>타겟 조건</Label><Input placeholder="적용 조건" className="mt-1" disabled /></div>
                <div><Label>발급 수량 제한</Label><Input type="number" placeholder="발급 수량" className="mt-1" disabled /></div>
                <div className="sm:col-span-2"><Button variant="coral" disabled><Plus className="mr-1 h-4 w-4" /> 쿠폰 생성</Button></div>
              </CardContent>
            </Card>
            {couponsError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {couponsError}
              </div>
            )}
            <DataTable
              data={coupons}
              columns={couponColumns}
              searchKeys={["title", "code", "user_id", "client_key"]}
              filters={[
                {
                  key: "is_used",
                  label: "사용 상태",
                  options: [
                    { value: "false", label: "미사용" },
                    { value: "true", label: "사용 완료" },
                  ],
                },
              ]}
              exportFilename="coupons.csv"
              emptyMessage={couponsLoading ? "쿠폰 목록을 불러오는 중입니다." : "등록된 쿠폰이 없습니다."}
            />
          </TabsContent>

          <TabsContent value="promo" className="mt-6">
            <DataTable
              data={promoCodes}
              columns={promoColumns}
              searchKeys={["code", "influencer"]}
              exportFilename="promo-codes.csv"
              emptyMessage="등록된 제휴 코드가 없습니다."
            />
          </TabsContent>

          <TabsContent value="referral" className="mt-6">
            <DataTable
              data={referralRecords}
              columns={referralColumns}
              searchKeys={["referrerName", "referredName"]}
              exportFilename="referrals.csv"
              emptyMessage="친구 초대 내역이 없습니다."
            />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
