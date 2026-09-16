"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RollingCard = {
  id: string | number;
  tag: string;
  partner_name: string;
  country: string;
  image_url: string;
  speech_bubble: string;
};

type HeroSettings = {
  title: string;
  subtitle: string;
  primary_cta_text: string;
  primary_cta_link: string;
  secondary_cta_text: string;
  secondary_cta_link: string;
  rolling_cards: RollingCard[];
};

const DEFAULT_HERO: HeroSettings = {
  title: "외국인과 이야기해보고 싶지만,\n어디서 어떻게 시작할지 몰랐다면",
  subtitle: "관심사가 맞는 사람과 준비된 이야기로 가볍게 만나보세요.\n단어가 생각나지 않을 때에는 AI 매니저가 함께해요.",
  primary_cta_text: "어떤 대화를 나누나요? 👉",
  primary_cta_link: "#topics",
  secondary_cta_text: "내 스피킹 감각 알아보기 >",
  secondary_cta_link: "#quiz",
  rolling_cards: [
    {
      id: 1,
      tag: "🌸 AI 코파일럿 실시간 지원 중",
      partner_name: "Yui",
      country: "Japan",
      image_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Yui",
      speech_bubble: "こんにちは！今日もお疲れ様です✨",
    },
    {
      id: 2,
      tag: "☕ 따뜻한 일상 대화",
      partner_name: "Camille",
      country: "France",
      image_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Camille",
      speech_bubble: "Salut ! On parle de quoi aujourd'hui ?",
    },
    {
      id: 3,
      tag: "🗽 실전 여행 영어",
      partner_name: "Alex",
      country: "USA",
      image_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Alex",
      speech_bubble: "Hey there! Ready to practice some real English?",
    },
  ],
};

function normalizeSettings(value: unknown): HeroSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<HeroSettings>;
  return {
    ...DEFAULT_HERO,
    ...raw,
    rolling_cards: Array.isArray(raw.rolling_cards)
      ? raw.rolling_cards.map((card, index) => ({
        id: card.id ?? `card-${index + 1}`,
        tag: String(card.tag || ""),
        partner_name: String(card.partner_name || ""),
        country: String(card.country || ""),
        image_url: String(card.image_url || ""),
        speech_bubble: String(card.speech_bubble || ""),
      }))
      : DEFAULT_HERO.rolling_cards,
  };
}

export function HeroCopyEditor() {
  const [settings, setSettings] = useState<HeroSettings>(DEFAULT_HERO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "hero_section")
        .maybeSingle();
      if (!active) return;
      if (result.error) {
        setError("저장된 설정을 불러오지 못해 현재 랜딩 기본값을 표시합니다.");
      } else if (result.data?.value) {
        setSettings(normalizeSettings(result.data.value));
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  function updateField<K extends keyof HeroSettings>(key: K, value: HeroSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice("");
  }

  function updateCard(index: number, key: keyof RollingCard, value: string) {
    setSettings((current) => ({
      ...current,
      rolling_cards: current.rolling_cards.map((card, cardIndex) =>
        cardIndex === index ? { ...card, [key]: value } : card
      ),
    }));
    setNotice("");
  }

  function addCard() {
    const nextId = `card-${Date.now()}`;
    updateField("rolling_cards", [
      ...settings.rolling_cards,
      {
        id: nextId,
        tag: "✨ 새로운 대화",
        partner_name: "",
        country: "",
        image_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(nextId)}`,
        speech_bubble: "",
      },
    ]);
  }

  function removeCard(index: number) {
    updateField("rolling_cards", settings.rolling_cards.filter((_, cardIndex) => cardIndex !== index));
  }

  async function save() {
    setSaving(true);
    setNotice("");
    setError("");
    const auth = await supabase.auth.getUser();
    const result = await supabase.from("site_settings").upsert({
      key: "hero_section",
      value: settings,
      updated_at: new Date().toISOString(),
      updated_by: auth.data.user?.id || null,
    }, { onConflict: "key" });
    setSaving(false);
    if (result.error) {
      setError(result.error.message || "히어로 설정 저장에 실패했습니다.");
      return;
    }
    setNotice("히어로 섹션 설정이 성공적으로 반영되었습니다 ✨");
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  }

  return (
    <div className="space-y-6">
      {notice && <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{notice}</p>}
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>영역 A · 히어로 텍스트 관리</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="hero-title">메인 타이틀</Label>
            <Textarea id="hero-title" value={settings.title} onChange={(event) => updateField("title", event.target.value)} />
            <p className="text-xs text-muted-foreground">입력한 줄바꿈이 메인 화면에 그대로 반영됩니다.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hero-subtitle">서브 설명 카피</Label>
            <Textarea id="hero-subtitle" value={settings.subtitle} onChange={(event) => updateField("subtitle", event.target.value)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hero-primary-text">메인 CTA 버튼 텍스트</Label>
              <Input id="hero-primary-text" value={settings.primary_cta_text} onChange={(event) => updateField("primary_cta_text", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-primary-link">메인 CTA 이동 링크</Label>
              <Input id="hero-primary-link" value={settings.primary_cta_link} onChange={(event) => updateField("primary_cta_link", event.target.value)} placeholder="#topics" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-secondary-text">서브 링크 텍스트</Label>
              <Input id="hero-secondary-text" value={settings.secondary_cta_text} onChange={(event) => updateField("secondary_cta_text", event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-secondary-link">서브 링크 이동 URL</Label>
              <Input id="hero-secondary-link" value={settings.secondary_cta_link} onChange={(event) => updateField("secondary_cta_link", event.target.value)} placeholder="#quiz" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>영역 B · 우측 비주얼 롤링 카드</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">등록 순서대로 3.5초마다 자동 전환됩니다.</p>
          </div>
          <Button type="button" variant="outline" onClick={addCard}><Plus className="mr-1 h-4 w-4" /> 새 롤링 카드 추가</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {!settings.rolling_cards.length && (
            <p className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">등록된 롤링 카드가 없습니다.</p>
          )}
          {settings.rolling_cards.map((card, index) => (
            <section key={card.id} className="grid gap-4 rounded-xl border p-4 lg:grid-cols-[140px_1fr]">
              <div className="flex flex-col items-center justify-center rounded-xl bg-gradient-to-br from-rose-50 to-amber-50 p-3 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.image_url} alt="" className="h-20 w-20 rounded-full border-2 border-white bg-white object-cover shadow" />
                <strong className="mt-2 text-sm">{card.partner_name || "파트너명"}</strong>
                <span className="text-xs text-muted-foreground">{card.country || "국가"}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>상단 뱃지 텍스트</Label>
                  <Input value={card.tag} onChange={(event) => updateCard(index, "tag", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>파트너 / 호스트 이름</Label>
                  <Input value={card.partner_name} onChange={(event) => updateCard(index, "partner_name", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>국가 / 지역</Label>
                  <Input value={card.country} onChange={(event) => updateCard(index, "country", event.target.value)} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>이미지 / 아바타 URL</Label>
                  <Input value={card.image_url} onChange={(event) => updateCard(index, "image_url", event.target.value)} />
                  <div className="flex flex-wrap gap-2 pt-1">
                    {["Yui", "Camille", "Alex"].map((seed) => (
                      <Button key={seed} type="button" size="sm" variant="outline" onClick={() => updateCard(index, "image_url", `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`)}>
                        {seed} 프리셋
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>말풍선 대화 텍스트</Label>
                  <Textarea className="min-h-20" value={card.speech_bubble} onChange={(event) => updateCard(index, "speech_bubble", event.target.value)} />
                </div>
                <div className="flex justify-end md:col-span-2">
                  <Button type="button" size="sm" variant="outline" className="text-rose-600" onClick={() => removeCard(index)}>
                    <Trash2 className="mr-1 h-4 w-4" /> 삭제
                  </Button>
                </div>
              </div>
            </section>
          ))}
        </CardContent>
      </Card>

      <Button variant="coral" size="lg" disabled={saving} onClick={() => void save()}>
        <Save className="mr-2 h-4 w-4" />
        {saving ? "저장 중..." : "변경사항 저장"}
      </Button>
    </div>
  );
}
