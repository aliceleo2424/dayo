"use client";

import { AdminHeader } from "@/components/admin/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { dashboardKpis, channelMetrics, purposeMetrics, activityFeed } from "@/lib/mockData";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, UserPlus, CreditCard, FlaskConical } from "lucide-react";

const icons = [CreditCard, UserPlus, FlaskConical, TrendingUp];

export default function DashboardPage() {
  return (
    <>
      <AdminHeader title="종합 대시보드" />
      <main className="space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dashboardKpis.map((kpi, i) => {
            const Icon = icons[i];
            const up = kpi.change >= 0;
            return (
              <Card key={kpi.label}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{kpi.value}</div>
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    {up ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                    <Badge variant={up ? "success" : "warning"}>{up ? "+" : ""}{kpi.change}%</Badge>
                    <span className="text-muted-foreground">{kpi.changeLabel}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>마케팅 채널별 유입 & ROAS</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={channelMetrics}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="source" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="visitors" name="유입" fill="#64748B" radius={[4,4,0,0]} />
                  <Bar dataKey="conversions" name="전환" fill="#FF6B57" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>수강 목적 & 관심 언어 비중</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={purposeMetrics} dataKey="count" nameKey="purpose" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3}>
                    {purposeMetrics.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>실시간 활동 피드</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activityFeed.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Badge variant={item.type === "payment" ? "coral" : item.type === "signup" ? "success" : "default"}>
                      {item.type === "payment" ? "결제" : item.type === "signup" ? "가입" : "테스트"}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{item.userName}</p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    {item.amount && <p className="text-sm font-semibold text-coral">{formatCurrency(item.amount)}</p>}
                    <p className="text-xs text-muted-foreground">{formatDateTime(item.timestamp)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
