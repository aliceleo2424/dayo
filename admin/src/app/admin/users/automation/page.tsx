"use client";

import { AdminHeader } from "@/components/admin/header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { automationRules } from "@/lib/mockData";
import { formatDateTime } from "@/lib/utils";
import { Plus, Zap } from "lucide-react";

export default function AutomationPage() {
  return (
    <>
      <AdminHeader title="CRM 자동화 Rule Engine" />
      <main className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">조건부 Trigger/Action 기반 CRM 자동화 규칙을 관리합니다.</p>
          <Button variant="coral"><Plus className="mr-1 h-4 w-4" /> 새 규칙 추가</Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {automationRules.map((rule) => (
            <Card key={rule.id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-coral" />
                    <Badge variant={rule.isActive ? "success" : "default"}>{rule.isActive ? "활성" : "비활성"}</Badge>
                  </div>
                  <CardTitle className="text-base">{rule.name}</CardTitle>
                  <CardDescription className="mt-1">채널: {rule.channel.toUpperCase()}</CardDescription>
                </div>
                <Switch checked={rule.isActive} />
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs font-medium text-muted-foreground">TRIGGER</p>
                  <p>{rule.trigger}</p>
                </div>
                <div className="rounded-lg bg-coral/5 p-3">
                  <p className="text-xs font-medium text-coral">ACTION</p>
                  <p>{rule.action}</p>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>실행 {rule.triggeredCount}회</span>
                  {rule.lastTriggeredAt && <span>최근: {formatDateTime(rule.lastTriggeredAt)}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
