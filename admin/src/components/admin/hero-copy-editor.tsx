"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Plus, Save, Trash2 } from "lucide-react";
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
  primary_cta_text: "내 스피킹 감각 알아보기 >",
  primary_cta_link: "#quiz",
  secondary_cta_text: "어떤 대화를 나누나요? 👉",
  secondary_cta_link: "#topics",
  rolling_cards: [],
};

function normalizeSettings(value: unknown): HeroSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<HeroSettings>;
  const normalized = {
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
  if (normalized.primary_cta_link === "#topics" && normalized.secondary_cta_link === "#quiz") {
    return {
      ...normalized,
      primary_cta_text: normalized.secondary_cta_text,
      primary_cta_link: normalized.secondary_cta_link,
      secondary_cta_text: normalized.primary_cta_text,
      secondary_cta_link: normalized.primary_cta_link,
    };
  }
  return normalized;
}

export function HeroCopyEditor() {
  const [settings, setSettings] = useState<HeroSettings>(DEFAULT_HERO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
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
        tag: "",
        partner_name: "",
        country: "",
        image_url: "",
        speech_bubble: "",
      },
    ]);
  }

  function removeCard(index: number) {
    updateField("rolling_cards", settings.rolling_cards.filter((_, cardIndex) => cardIndex !== index));
  }

  async function uploadCardImage(index: number, file: File) {
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("사진은 10MB 이하 파일만 업로드할 수 있습니다.");
      return;
    }

    const card = settings.rolling_cards[index];
    if (!card) return;
    const uploadKey = String(card.id);
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const objectPath = `hero-cards/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    setError("");
    setNotice("");
    setUploading((current) => ({ ...current, [uploadKey]: true }));

    try {
      const result = await supabase.storage.from("public-assets").upload(objectPath, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });
      if (result.error) throw result.error;

      const publicUrl = supabase.storage.from("public-assets").getPublicUrl(result.data.path).data.publicUrl;
      setSettings((current) => ({
        ...current,
        rolling_cards: current.rolling_cards.map((item) =>
          String(item.id) === uploadKey ? { ...item, image_url: publicUrl } : item
        ),
      }));
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "사진 업로드에 실패했습니다.";
      console.error("[DayO CMS] hero image upload failed", uploadError);
      setError(`사진 업로드 실패: ${message}`);
      window.alert(`사진을 업로드하지 못했습니다.\n${message}`);
    } finally {
      setUploading((current) => ({ ...current, [uploadKey]: false }));
    }
  }

  async function save() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const result = await supabase.from("site_settings").upsert({
        key: "hero_section",
        value: settings,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" }).select("key, updated_at").single();
      if (result.error) throw result.error;
      const success = "✅ 카피 에디터 설정이 저장되어 dayotalk.com 메인에 즉시 반영되었습니다.";
      setNotice(success);
      window.setTimeout(() => setNotice((current) => current === success ? "" : current), 4500);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "히어로 설정 저장에 실패했습니다.";
      console.error("[DayO CMS] hero save failed", saveError);
      setError(`저장 실패: ${message}`);
      window.alert(`히어로 설정을 저장하지 못했습니다.\n${message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-xl bg-muted" />;
  }

  return (
    <div className="space-y-6">
      {notice && <div className="fixed right-6 top-6 z-[100] max-w-md rounded-xl bg-emerald-600 px-5 py-4 text-sm font-semibold text-white shadow-xl">{notice}</div>}
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
              <Label htmlFor="hero-primary-text">메인 CTA 버튼 · 스피킹 감각 진단</Label>
              <Input id="hero-primary-text" value={settings.primary_cta_text} onChange={(event) => updateField("primary_cta_text", event.target.value)} placeholder="내 스피킹 감각 알아보기 >" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-primary-link">메인 CTA 이동 링크</Label>
              <Input id="hero-primary-link" value={settings.primary_cta_link} onChange={(event) => updateField("primary_cta_link", event.target.value)} placeholder="#quiz" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-secondary-text">서브 링크 · 대화 주제 안내</Label>
              <Input id="hero-secondary-text" value={settings.secondary_cta_text} onChange={(event) => updateField("secondary_cta_text", event.target.value)} placeholder="어떤 대화를 나누나요? 👉" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-secondary-link">서브 링크 이동 URL</Label>
              <Input id="hero-secondary-link" value={settings.secondary_cta_link} onChange={(event) => updateField("secondary_cta_link", event.target.value)} placeholder="#topics" />
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
                {card.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.image_url} alt="" className="h-20 w-20 rounded-full border-2 border-white bg-white object-cover shadow" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-stone-300 bg-white text-stone-400">
                    <ImagePlus className="h-7 w-7" aria-hidden="true" />
                  </div>
                )}
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
                  <Label>파트너 사진</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent">
                      {uploading[String(card.id)] ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> 업로드 중...</>
                      ) : (
                        <><ImagePlus className="mr-2 h-4 w-4" /> 사진 파일 선택</>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={uploading[String(card.id)]}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadCardImage(index, file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                    <span className="text-xs text-muted-foreground">JPG, PNG, WebP 등 · 최대 10MB</span>
                  </div>
                  <Label className="block pt-2">또는 외부 이미지 URL</Label>
                  <Input value={card.image_url} onChange={(event) => updateCard(index, "image_url", event.target.value)} placeholder="https://..." />
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

      <Button variant="coral" size="lg" disabled={saving || Object.values(uploading).some(Boolean)} onClick={() => void save()}>
        <Save className="mr-2 h-4 w-4" />
        {saving ? "저장 중..." : Object.values(uploading).some(Boolean) ? "사진 업로드 완료 대기 중..." : "변경사항 저장"}
      </Button>
    </div>
  );
}
