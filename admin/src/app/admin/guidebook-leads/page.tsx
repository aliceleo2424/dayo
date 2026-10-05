"use client";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminHeader } from '@/components/admin/header';
import { Button } from '@/components/ui/button';
import { filterLabels, filterLeads, guidebookCsv, leadDate, listGuidebookLeads, loadGuidebookSummary, marketingEligible,
  type GuidebookLead, type LeadFilter, type LeadSummary } from '@/lib/guidebook-leads';

export default function GuidebookLeadsPage() {
  const [rows, setRows] = useState<GuidebookLead[]>([]);
  const [summary, setSummary] = useState<LeadSummary | null>(null);
  const [preserved, setPreserved] = useState(false);
  const [filter, setFilter] = useState<LeadFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError(''); setRows([]); setSummary(null); setNotice('');
    try {
      const data = await listGuidebookLeads();
      const result = await loadGuidebookSummary(data);
      setRows(data); setSummary(result.summary); setPreserved(result.preserved);
    } catch (e) { setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(0); }, [filter, search]);
  const selected = useMemo(() => filterLeads(rows, filter, search), [rows, filter, search]);
  const pageCount = Math.max(1, Math.ceil(selected.length / 25));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = selected.slice(currentPage * 25, (currentPage + 1) * 25);
  async function exportCsv(eligibleOnly: boolean) {
    setExporting(true); setError(''); setNotice('');
    try {
      // Always reread consent immediately before export. Screen filters do not limit full export.
      const data = await listGuidebookLeads();
      if (!data.some(row => !eligibleOnly || marketingEligible(row))) {
        setNotice('내보낼 리드가 없습니다.'); return;
      }
      const blob = new Blob([guidebookCsv(data, eligibleOnly)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url;
      link.download = `가이드북-리드-${eligibleOnly ? '마케팅가능' : '전체'}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('CSV를 내보냈습니다. 발송 직전 서버에서 동의 상태를 다시 확인해 주세요.');
    } catch (e) { setError(e instanceof Error ? e.message : 'CSV를 내보내지 못했습니다.'); }
    finally { setExporting(false); }
  }
  const cards = summary ? [
    ['총 가이드북 신청 수', `${summary.total.toLocaleString('ko-KR')}건`],
    ['마케팅 동의 수', `${summary.consented.toLocaleString('ko-KR')}건`],
    ['마케팅 동의율', `${summary.consentRate.toFixed(1)}%`],
    ['발송 실패 / 미완료', `${summary.unsent.toLocaleString('ko-KR')}건`],
    ['철회 수', `${summary.withdrawn.toLocaleString('ko-KR')}건`],
  ] : [];
  return <>
    <AdminHeader title="가이드북 리드" />
    <main className="min-w-0 space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold">가이드북 신청 관리</h2><p className="mt-1 text-sm text-muted-foreground">이메일은 운영 목적에만 사용하고 CSV 파일은 안전하게 보관해 주세요.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={loading || exporting} onClick={() => void load()}>새로고침</Button>
          <Button variant="outline" disabled={loading || exporting || !!error} onClick={() => void exportCsv(false)}>전체 CSV 내보내기</Button>
          <Button disabled={loading || exporting || !!error} onClick={() => void exportCsv(true)}>마케팅 가능 리드 CSV</Button>
        </div>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {loading ? <p role="status">리드를 불러오는 중입니다…</p> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{cards.map(([label, value]) => <section key={label} className="rounded-xl border bg-card p-4"><h3 className="text-xs text-muted-foreground">{label}</h3><p className="mt-2 text-2xl font-semibold">{value}</p></section>)}</div>
        {summary && <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
          <p>신청 수는 중복 재신청을 제외한 리드 수입니다. 동의 수·동의율은 한 번 이상 동의한 기록 기준이며, 현재 발송 가능 여부와 다릅니다. 철회 수는 철회 이력이 있는 리드 수입니다.</p>
          <p>발송 실패 / 미완료는 발송 성공 기록이 없는 신청입니다. 처리 중 또는 발송 기록 저장 실패도 포함하며, 실제 메일 도착 여부를 뜻하지 않습니다. 모든 시간은 한국 표준시(KST)입니다.</p>
          <p>{preserved ? `30일 만료 삭제된 ${summary.archived}건은 이메일 없는 날짜별 집계로 보존됩니다. 목록·CSV에는 현재 보관 중인 이메일만 포함됩니다.` : '현재 보관 중인 리드만 집계합니다. 장기 집계 보존이 활성화되기 전에는 30일 만료 삭제 후 과거 집계가 유지되지 않습니다.'}</p>
        </div>}
        <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="리드 필터">
          <div className="flex flex-wrap gap-2">{(Object.keys(filterLabels) as LeadFilter[]).map(key => <Button key={key} size="sm" variant={filter === key ? 'default' : 'outline'} aria-pressed={filter === key} onClick={() => setFilter(key)}>{filterLabels[key]}</Button>)}</div>
          <div className="flex flex-wrap items-center gap-3"><label className="flex w-full min-w-0 flex-col gap-1 text-sm sm:w-auto sm:flex-1 sm:flex-row sm:items-center sm:gap-2">이메일 검색<input value={search} onChange={e => setSearch(e.target.value)} placeholder="이메일 일부 입력" className="min-w-0 flex-1 rounded-md border bg-background p-2" /></label><span className="text-sm">현재 목록 {selected.length.toLocaleString('ko-KR')}건</span></div>
        </section>
        <section className="overflow-x-auto rounded-xl border bg-card" aria-label="가이드북 리드 목록" tabIndex={0}>
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-muted/50"><tr>{['이메일', '유입 경로', '신청일', '가이드북 발송일', '마케팅 동의', '동의일', '철회일', '현재 마케팅 발송 가능'].map(label => <th key={label} scope="col" className="whitespace-nowrap p-3 font-medium">{label}</th>)}</tr></thead>
            <tbody>{visible.map(row => <tr key={row.id} className="border-t align-top">
              <td className="min-w-[220px] max-w-[320px] break-all p-3">{row.email}</td><td className="p-3 text-xs">{row.source}</td>
              <td className="whitespace-nowrap p-3">{leadDate(row.created_at)}</td><td className="whitespace-nowrap p-3">{row.guidebook_sent_at ? leadDate(row.guidebook_sent_at) : '미완료 / 실패 포함'}</td>
              <td className="p-3">{row.marketing_consent ? '동의' : '미동의'}</td><td className="whitespace-nowrap p-3">{leadDate(row.marketing_consented_at)}</td><td className="whitespace-nowrap p-3">{leadDate(row.marketing_withdrawn_at)}</td>
              <td className="p-3"><span className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs ${marketingEligible(row) ? 'bg-green-50 text-green-800' : 'bg-muted text-muted-foreground'}`}>{marketingEligible(row) ? '가능' : '불가'}</span></td>
            </tr>)}</tbody>
          </table>
          {!visible.length && <p className="p-8 text-center text-sm text-muted-foreground">조건에 맞는 가이드북 리드가 없습니다.</p>}
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><p>마케팅 발송 가능: 동의 상태이며 철회일이 없는 리드만 해당합니다.</p><div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>이전</Button><span>{currentPage + 1} / {pageCount}페이지</span><Button size="sm" variant="outline" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>다음</Button></div></div>
      </>}
    </main>
  </>;
}
