"use client";

import { AdminHeader } from "@/components/admin/header";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { coupons, promoCodes, referralRecords } from "@/lib/mockData";
import type { Coupon, PromoCode, ReferralRecord } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus } from "lucide-react";

export default function PromotionsPage() {
  const couponColumns: Column<Coupon & Record<string, unknown>>[] = [
    { key: "name", header: "쿠폰명", sortable: true },
    { key: "code", header: "코드", render: (r) => <Badge variant="coral">{r.code as string}</Badge> },
    { key: "discountType", header: "할인", render: (r) => r.discountType === "percent" ? `${r.discountValue}%` : formatCurrency(r.discountValue as number) },
    { key: "targetCondition", header: "타겟 조건" },
    { key: "issuedCount", header: "발급/사용", render: (r) => `${r.issuedCount} / ${r.usedCount}` },
    { key: "validUntil", header: "유효기간", render: (r) => formatDate(r.validUntil as string) },
    { key: "isActive", header: "상태", render: (r) => <Badge variant={r.isActive ? "success" : "default"}>{r.isActive ? "활성" : "비활성"}</Badge> },
  ];

  const promoColumns: Column<PromoCode & Record<string, unknown>>[] = [
    { key: "code", header: "제휴 코드", sortable: true, render: (r) => <Badge variant="coral">{r.code as string}</Badge> },
    { key: "influencer", header: "인플루언서", sortable: true },
    { key: "platform", header: "플랫폼" },
    { key: "signups", header: "가입", sortable: true },
    { key: "conversions", header: "전환", sortable: true },
    { key: "revenue", header: "매출", render: (r) => formatCurrency(r.revenue as number) },
  ];

  const referralColumns: Column<ReferralRecord & Record<string, unknown>>[] = [
    { key: "referrerName", header: "초대자", sortable: true },
    { key: "referredName", header: "피초대자" },
    { key: "rewardAmount", header: "보상", render: (r) => formatCurrency(r.rewardAmount as number) },
    { key: "rewardGiven", header: "지급", render: (r) => <Badge variant={r.rewardGiven ? "success" : "warning"}>{r.rewardGiven ? "완료" : "대기"}</Badge> },
    { key: "createdAt", header: "일시", render: (r) => formatDate(r.createdAt as string) },
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
              <CardHeader><CardTitle>쿠폰 생성기</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div><Label>쿠폰명</Label><Input placeholder="신규 가입 웰컴" className="mt-1" /></div>
                <div><Label>쿠폰 코드</Label><Input placeholder="WELCOME20" className="mt-1" /></div>
                <div><Label>할인 방식</Label>
                  <Select defaultValue="percent"><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="percent">정률 (%)</SelectItem><SelectItem value="fixed">정액 (₩)</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label>할인 값</Label><Input type="number" placeholder="20" className="mt-1" /></div>
                <div><Label>타겟 조건</Label><Input placeholder="신규 가입자, 오픽 수강생 등" className="mt-1" /></div>
                <div><Label>발급 수량 제한</Label><Input type="number" placeholder="1000" className="mt-1" /></div>
                <div className="sm:col-span-2"><Button variant="coral"><Plus className="mr-1 h-4 w-4" /> 쿠폰 생성</Button></div>
              </CardContent>
            </Card>
            <DataTable data={coupons as (Coupon & Record<string, unknown>)[]} columns={couponColumns} searchKeys={["name", "code"]} exportFilename="coupons.csv" />
          </TabsContent>

          <TabsContent value="promo" className="mt-6">
            <DataTable data={promoCodes as (PromoCode & Record<string, unknown>)[]} columns={promoColumns} searchKeys={["code", "influencer"]} exportFilename="promo-codes.csv" />
          </TabsContent>

          <TabsContent value="referral" className="mt-6">
            <DataTable data={referralRecords as (ReferralRecord & Record<string, unknown>)[]} columns={referralColumns} searchKeys={["referrerName", "referredName"]} exportFilename="referrals.csv" />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}
