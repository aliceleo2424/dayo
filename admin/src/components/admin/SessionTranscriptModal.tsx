"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  bookingStatusLabel,
  fetchSessionTranscriptBundle,
  formatSessionDateTime,
  type SessionCsReport,
  type SessionTranscriptBundle,
  type SessionTranscriptContext,
  type SessionUtterance,
} from "@/lib/admin-data";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  session: SessionTranscriptContext | null;
  onClose: () => void;
};

function formatClock(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function sessionRangeLabel(session: SessionTranscriptContext | null, bundle: SessionTranscriptBundle | null) {
  const start = bundle?.startedAt || session?.scheduled_at || null;
  if (!start) return "세션 일시 미정";
  const startLabel = formatSessionDateTime(start);
  const end = bundle?.endedAt;
  if (!end) return startLabel;
  const endClock = formatClock(end).slice(0, 5);
  if (!endClock) return startLabel;
  return `${startLabel} - ${endClock}`;
}

function TranscriptBubble({
  row,
  learnerName,
  partnerName,
}: {
  row: SessionUtterance;
  learnerName: string;
  partnerName: string;
}) {
  const isLearner = row.speaker === "learner";
  const isPartner = row.speaker === "partner";
  return (
    <div className={cn("flex w-full", isLearner ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[88%] space-y-1", isLearner ? "items-end text-right" : "items-start text-left")}>
        <p className="px-1 text-[11px] font-medium text-[#78716C]">
          {isLearner ? learnerName : isPartner ? partnerName : "화자"}
          {row.timestamp ? ` · ${formatClock(row.timestamp)}` : ""}
        </p>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
            isLearner
              ? "rounded-br-md bg-[#FFE8E0] text-[#44403C]"
              : "rounded-bl-md bg-[#E8F0EA] text-[#292524]"
          )}
        >
          {row.text}
        </div>
      </div>
    </div>
  );
}

function ReportPanel({ report }: { report: SessionCsReport }) {
  if (!report.hasReport) {
    return (
      <div className="rounded-2xl border border-dashed bg-[#FAFAF9] px-4 py-10 text-center text-sm text-muted-foreground">
        세션 완료 후 AI 리포트가 생성됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h4 className="mb-2 text-sm font-semibold text-[#44403C]">고객 만족도 및 후기</h4>
        {report.rating != null ? (
          <p className="text-base font-bold text-[#292524]">★ {Number(report.rating).toFixed(1)}</p>
        ) : (
          <p className="text-sm text-muted-foreground">별점 미등록</p>
        )}
        <p className="mt-2 text-sm text-[#57534E]">
          {report.review ? `“${report.review}”` : "작성된 한줄평이 없습니다."}
        </p>
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h4 className="mb-2 text-sm font-semibold text-[#44403C]">온디맨드 단어도움 분석</h4>
        <p className="text-sm text-[#57534E]">총 {report.wordHelpCount}회 호출</p>
        {report.wordHelpVocab.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {report.wordHelpVocab.map((word) => (
              <span
                key={word}
                className="inline-flex rounded-full bg-[#F5F5F4] px-2.5 py-1 text-xs font-semibold text-[#44403C]"
              >
                {word}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">추천 어휘 기록이 없습니다.</p>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h4 className="mb-2 text-sm font-semibold text-[#44403C]">AI 문장 교정 피드백</h4>
        {report.corrections.length ? (
          <ul className="space-y-2">
            {report.corrections.map((item, index) => (
              <li key={`${item.original}-${index}`} className="rounded-xl bg-[#FAFAF9] p-3 text-sm">
                <p className="text-[#A8A29E] line-through">{item.original}</p>
                <p className="mt-1 font-medium text-[#292524]">→ {item.corrected}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">교정 피드백이 아직 없습니다.</p>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h4 className="mb-2 text-sm font-semibold text-[#44403C]">파트너 최종 피드백</h4>
        <p className="text-2xl">{report.partnerStamp || "☕"}</p>
        <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
          {report.partnerComment || "파트너 총평이 아직 없습니다."}
        </p>
      </section>
    </div>
  );
}

export function SessionTranscriptModal({ open, session, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<SessionTranscriptBundle | null>(null);

  useEffect(() => {
    if (!open || !session?.id) {
      setBundle(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchSessionTranscriptBundle(session)
      .then((data) => {
        if (!cancelled) setBundle(data);
      })
      .catch(() => {
        if (!cancelled) {
          setBundle({
            utterances: [],
            report: {
              rating: session.rating ?? null,
              review: session.review ?? null,
              wordHelpCount: 0,
              wordHelpVocab: [],
              corrections: [],
              partnerStamp: null,
              partnerComment: null,
              hasReport: !!(session.rating != null || session.review),
            },
            startedAt: session.scheduled_at || null,
            endedAt: null,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, session]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !session) return null;

  const learnerName = session.learnerName || "학습자";
  const partnerName = session.partnerName || "파트너";
  const status = bookingStatusLabel(session.status);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="세션 대화록 및 AI 리포트"
      >
        <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-[#292524]">
                {sessionRangeLabel(session, bundle)}
              </h2>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <p className="text-sm text-[#57534E]">
              {learnerName} <span className="text-[#A8A29E]">⟷</span> {partnerName}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="닫기">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[1.5fr_1fr]">
          <section className="min-h-0 overflow-y-auto border-b bg-[#FFFCFB] p-4 lg:border-b-0 lg:border-r">
            <h3 className="mb-3 text-sm font-semibold text-[#44403C]">실시간 발화 타임라인</h3>
            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : !bundle?.utterances.length ? (
              <div className="rounded-2xl border border-dashed bg-white px-4 py-12 text-center text-sm text-muted-foreground">
                수집된 발화 텍스트 데이터가 없습니다. (세션 진행 전이거나 미수집 세션) ☕
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {bundle.utterances.map((row) => (
                  <TranscriptBubble
                    key={row.id}
                    row={row}
                    learnerName={learnerName}
                    partnerName={partnerName}
                  />
                ))}
              </div>
            )}
          </section>

          <aside className="min-h-0 overflow-y-auto bg-[#FAFAF9] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[#44403C]">AI 분석 요약 & 세션 리포트</h3>
            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : (
              <ReportPanel
                report={
                  bundle?.report || {
                    rating: session.rating ?? null,
                    review: session.review ?? null,
                    wordHelpCount: 0,
                    wordHelpVocab: [],
                    corrections: [],
                    partnerStamp: null,
                    partnerComment: null,
                    hasReport: !!(session.rating != null || session.review),
                  }
                }
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
