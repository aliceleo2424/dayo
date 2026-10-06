"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addBookingCsNote,
  bookingStatusLabel,
  clearLegacyBookingCsNote,
  deleteBookingCsNote,
  fetchSessionDetailContext,
  fetchSessionTranscriptBundle,
  formatSessionDateTime,
  listBookingCsNotes,
  type AdminNoteEntry,
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

const LEGACY_CS_NOTE_DELETE_ID = "legacy";

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
        이 세션의 저장된 리포트가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {report.summary || report.recap ? (
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <h4 className="mb-2 text-sm font-semibold text-[#44403C]">저장된 대화 리캡</h4>
          {report.summary ? <p className="text-sm text-[#57534E]">{report.summary}</p> : null}
          {report.recap ? (
            <div className="mt-2 space-y-2 text-sm text-[#57534E]">
              {report.recap.userWordCount != null ? <p>유저 단어 수: {report.recap.userWordCount}</p> : null}
              {report.recap.userUtteranceCount != null ? <p>유저 발화 수: {report.recap.userUtteranceCount}</p> : null}
              {report.recap.participationRatio != null ? <p>유저 참여 비율: {Math.round(report.recap.participationRatio * 100)}%</p> : null}
              {report.recap.topics.length ? <p>주제: {report.recap.topics.join(" · ")}</p> : null}
              {report.recap.expressions.length ? <ul className="list-inside list-disc">{report.recap.expressions.map((text, index) => <li key={index}>{text}</li>)}</ul> : null}
            </div>
          ) : null}
        </section>
      ) : null}
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
                {item.reason ? <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">교정 피드백이 아직 없습니다.</p>
        )}
      </section>

      <section className="rounded-2xl border bg-white p-4 shadow-sm">
        <h4 className="mb-2 text-sm font-semibold text-[#44403C]">파트너 최종 피드백</h4>
        {report.partnerStamp ? <p className="text-2xl">{report.partnerStamp}</p> : null}
        <p className="mt-2 text-sm leading-relaxed text-[#57534E]">
          {report.partnerComment || "파트너 총평이 아직 없습니다."}
        </p>
      </section>
    </div>
  );
}

function BookingCsNoteEditor({ session }: { session: SessionTranscriptContext }) {
  const [draft, setDraft] = useState("");
  const [entries, setEntries] = useState<AdminNoteEntry[]>([]);
  const [legacyNote, setLegacyNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const activeRef = useRef(true);
  const requestEpochRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    const epoch = ++requestEpochRef.current;
    let cancelled = false;
    setDraft("");
    setEntries([]);
    setLegacyNote("");
    setLoading(true);
    setLoadError("");
    setSaveError("");
    setNotice("");
    setDeleteId(null);
    setDeletingId(null);
    setDeleteError("");
    void listBookingCsNotes(session.id)
      .then((result) => {
        if (!cancelled && requestEpochRef.current === epoch) {
          setEntries(result.entries);
          setLegacyNote(result.legacyNote);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && requestEpochRef.current === epoch) {
          setLoadError(err instanceof Error ? err.message : "예약별 CS 메모를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled && requestEpochRef.current === epoch) setLoading(false);
      });
    return () => {
      cancelled = true;
      activeRef.current = false;
      requestEpochRef.current += 1;
    };
  }, [session.id, retryCount]);

  useEffect(() => {
    if (!deleteId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      if (!deletingId) { setDeleteId(null); setDeleteError(""); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [deleteId, deletingId]);

  async function handleAdd() {
    if (loading || saving || loadError || saveInFlightRef.current) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed.length > 2000) {
      setSaveError("CS 특이사항은 1~2,000자로 입력해 주세요.");
      return;
    }
    const epoch = requestEpochRef.current;
    saveInFlightRef.current = true;
    setSaving(true);
    setNotice("");
    setSaveError("");
    try {
      const entry = await addBookingCsNote(session.id, trimmed);
      if (!activeRef.current || requestEpochRef.current !== epoch) return;
      setEntries((current) => [entry, ...current]);
      setDraft("");
      setNotice("예약별 CS 메모가 추가되었습니다.");
    } catch (err) {
      if (activeRef.current && requestEpochRef.current === epoch) {
        setSaveError(err instanceof Error ? err.message : "예약별 CS 메모 추가에 실패했습니다.");
      }
    } finally {
      saveInFlightRef.current = false;
      if (activeRef.current && requestEpochRef.current === epoch) setSaving(false);
    }
  }

  async function handleDelete(entryId: string) {
    if (loading || loadError || deleteInFlightRef.current || deleteId !== entryId) return;
    const epoch = requestEpochRef.current;
    deleteInFlightRef.current = true;
    setDeletingId(entryId);
    setDeleteError("");
    try {
      if (entryId === LEGACY_CS_NOTE_DELETE_ID) {
        await clearLegacyBookingCsNote(session.id);
      } else {
        await deleteBookingCsNote(entryId);
      }
      if (!activeRef.current || requestEpochRef.current !== epoch) return;
      if (entryId === LEGACY_CS_NOTE_DELETE_ID) {
        setLegacyNote("");
      } else {
        setEntries((current) => current.filter((entry) => entry.id !== entryId));
      }
      setDeleteId(null);
    } catch (err) {
      if (activeRef.current && requestEpochRef.current === epoch) {
        setDeleteError(err instanceof Error ? err.message : "예약별 CS 메모 삭제에 실패했습니다.");
      }
    } finally {
      deleteInFlightRef.current = false;
      if (activeRef.current && requestEpochRef.current === epoch) setDeletingId(null);
    }
  }

  return (
    <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm">
      <p className="mb-2 text-xs text-[#78716C]">
        {formatSessionDateTime(session.scheduled_at)} · {session.partnerName || "파트너 미정"}
      </p>
      <Label htmlFor={`booking-cs-note-${session.id}`}>예약별 CS 특이사항</Label>
      <Textarea
        id={`booking-cs-note-${session.id}`}
        className="mt-2 min-h-[120px]"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setNotice("");
          setSaveError("");
        }}
        placeholder="이 예약의 새 CS 메모를 입력해 주세요. 기존 기록은 수정되지 않습니다."
        maxLength={2000}
        disabled={loading || saving || !!loadError}
      />
      {loading ? <p className="mt-2 text-xs text-muted-foreground">예약 메모를 불러오는 중…</p> : null}
      {loadError ? (
        <div className="mt-2">
          <p className="text-xs text-red-700" role="alert">{loadError}</p>
          <Button className="mt-2" size="sm" variant="outline" onClick={() => setRetryCount((count) => count + 1)}>
            다시 불러오기
          </Button>
        </div>
      ) : null}
      {saveError ? <p className="mt-2 text-xs text-red-700" role="alert">{saveError}</p> : null}
      {notice ? <p className="mt-2 text-xs text-emerald-700" role="status">{notice}</p> : null}
      <Button className="mt-3" size="sm" variant="coral" disabled={loading || saving || !!loadError} onClick={() => void handleAdd()}>
        {saving ? "추가 중…" : "메모 추가"}
      </Button>
      {!loading && !loadError ? (
        <div className="mt-4 space-y-2 border-t pt-3">
          {entries.length === 0 && !legacyNote ? <p className="text-xs text-muted-foreground">등록된 예약별 CS 메모가 없습니다.</p> : null}
          {entries.map((entry) => (
            <article key={entry.id} className="rounded-xl border bg-[#FAFAF9] p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">{formatSessionDateTime(entry.created_at)} · 운영자</p>
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label="예약별 CS 메모 삭제" disabled={!!deletingId} onClick={() => { setDeleteId(entry.id); setDeleteError(""); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#44403C]">{entry.note}</p>
            </article>
          ))}
          {legacyNote ? (
            <article className="rounded-xl border border-dashed bg-[#FAFAF9] p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">기존 예약별 CS 메모 · 작성일 미상</p>
                <Button type="button" size="icon" variant="ghost" className="h-6 w-6" aria-label="기존 예약 메모 삭제" disabled={!!deletingId} onClick={() => { setDeleteId(LEGACY_CS_NOTE_DELETE_ID); setDeleteError(""); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#44403C]">{legacyNote}</p>
            </article>
          ) : null}
        </div>
      ) : null}
      {deleteId ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4" role="presentation" onClick={(event) => { event.stopPropagation(); if (!deletingId) { setDeleteId(null); setDeleteError(""); } }}>
          <div className="w-full max-w-sm rounded-xl border bg-white p-5 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="booking-note-delete-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="booking-note-delete-title" className="text-lg font-semibold">{deleteId === LEGACY_CS_NOTE_DELETE_ID ? "기존 예약 메모를 삭제할까요?" : "이 메모를 삭제할까요?"}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{deleteId === LEGACY_CS_NOTE_DELETE_ID ? "이 기존 메모는 삭제 후 운영 화면에서 복구할 수 없습니다." : "삭제한 메모는 운영 화면에서 보이지 않습니다."}</p>
            {deleteError ? <p className="mt-3 text-sm text-red-700" role="alert">{deleteError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={!!deletingId} onClick={() => { setDeleteId(null); setDeleteError(""); }}>취소</Button>
              <Button type="button" variant="outline" className="border-red-300 text-red-700 hover:bg-red-100" disabled={!!deletingId} onClick={() => void handleDelete(deleteId)}>{deletingId ? "삭제 중…" : "삭제"}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function SessionTranscriptModal({ open, session, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [detailState, setDetailState] = useState<{ bookingId: string; data: SessionTranscriptContext } | null>(null);
  const [bundleState, setBundleState] = useState<{ bookingId: string; data: SessionTranscriptBundle } | null>(null);

  useEffect(() => {
    if (!open || !session?.id) {
      setDetailState(null);
      setBundleState(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const detail = await fetchSessionDetailContext(session.id).catch(() => session);
      if (cancelled) return;
      setDetailState({ bookingId: session.id, data: detail });
      try {
        const data = await fetchSessionTranscriptBundle(detail);
        if (!cancelled) setBundleState({ bookingId: session.id, data });
      } catch {
        if (!cancelled) setBundleState({ bookingId: session.id, data: {
            utterances: [],
            report: {
              rating: detail.rating ?? null,
              review: detail.review ?? null,
              wordHelpCount: 0,
              wordHelpVocab: [],
              corrections: [],
              partnerStamp: null,
              partnerComment: null,
              hasReport: !!(detail.rating != null || detail.review),
            },
            startedAt: detail.scheduled_at || null,
            endedAt: null,
          } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
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

  const detail = detailState?.bookingId === session.id ? detailState.data : null;
  const bundle = bundleState?.bookingId === session.id ? bundleState.data : null;
  const sessionLoading = loading || !bundle;
  const learnerName = detail?.learnerName || "유저";
  const partnerName = detail?.partnerName || "파트너";
  const status = bookingStatusLabel(detail?.status);

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
                {detail ? sessionRangeLabel(detail, bundle) : "예약 정보를 불러오는 중…"}
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
            {sessionLoading ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : !bundle?.utterances.length ? (
              <div className="rounded-2xl border border-dashed bg-white px-4 py-12 text-center text-sm text-muted-foreground">
                이 세션의 저장된 대화 기록이 없습니다.
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
            <BookingCsNoteEditor key={session.id} session={detail || session} />
            <h3 className="mb-3 text-sm font-semibold text-[#44403C]">AI 분석 요약 & 세션 리포트</h3>
            {sessionLoading ? (
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
            ) : (
              <ReportPanel
                report={
                  bundle?.report || {
                    rating: detail?.rating ?? null,
                    review: detail?.review ?? null,
                    wordHelpCount: 0,
                    wordHelpVocab: [],
                    corrections: [],
                    partnerStamp: null,
                    partnerComment: null,
                    hasReport: !!(detail?.rating != null || detail?.review),
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
