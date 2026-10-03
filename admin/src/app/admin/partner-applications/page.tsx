"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminHeader } from '@/components/admin/header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { actionChanges, applicationMedia, applicationMessage, applicationResidence, emptyFilters, listApplications, markApplicationViewed, periodLabels, profileSummary, selectApplications, shortlistApplication, sourceLabels, updateApplication, type Application, type ApplicationFilters, type ApplicationSort, type ReviewAction } from '@/lib/partner-applications';

const inputClass = 'w-full rounded border p-2 text-sm bg-background';
const actionLabels: Record<ReviewAction, string> = { invite: 'Invite to Test', hold: 'Hold', reject: 'Reject', approve: 'Approve' };
function validLink(value: string) {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}
function ApplicantMedia({ applicant }: { applicant: Application }) {
  const [media, setMedia] = useState<{ video: string | null }>({ video: null });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const path = applicant.intro_video_path;
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setMedia({ video: null });
    applicationMedia({ intro_video_path: path }).then(result => { if (active) setMedia(result); })
      .catch(() => { if (active) setError('비공개 파일을 불러오지 못했습니다. 관리자 권한과 Storage 정책을 확인하세요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, refresh]);
  return <section className="space-y-3 rounded border p-3" aria-label="Applicant introduction video">
    <h3 className="font-semibold">Short introduction video</h3>
    <p className="text-xs text-muted-foreground">관리자 전용 · 조회 링크는 2분 후 만료됩니다.</p>
    {loading && <p role="status">Loading private files…</p>}
    {error && <p role="status">{error}</p>}
    <div className="space-y-3">
      <div><p className="text-sm font-medium">Intro video</p>{media.video ? <><video src={media.video} controls preload="metadata" className="mt-2 w-full rounded" /><a href={media.video} target="_blank" rel="noopener noreferrer" className="text-sm underline">Open video</a></> : !loading && <p className="text-sm">{applicant.intro_video_path ? 'Unavailable' : 'Not submitted'}</p>}</div>
    </div>
    <p className="text-xs text-muted-foreground">사람이 검토할 항목: natural communication · camera comfort · clarity · friendliness · storytelling ability · suitability for conversational sessions</p>
    {applicant.intro_video_path && <Button variant="outline" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh private links</Button>}
  </section>;
}
export default function PartnerApplicationsPage() {
  const [rows, setRows] = useState<Application[]>([]);
  const [selected, setSelected] = useState<Application | null>(null);
  const [filters, setFilters] = useState<ApplicationFilters>({ ...emptyFilters });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ApplicationSort>('newest');
  const [starBusy, setStarBusy] = useState<string | null>(null);
  const linkedApplicationOpened = useRef(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [testStatus, setTestStatus] = useState<Application['test_status']>('not_invited');
  const [testLink, setTestLink] = useState('');
  const [onboardingLink, setOnboardingLink] = useState('');
  const [message, setMessage] = useState('');
  const [detailStatus, setDetailStatus] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setStatus('');
    try { setRows(await listApplications()); }
    catch { setStatus('지원서 조회에 실패했습니다. 관리자 권한과 migration 적용 여부를 확인하세요.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const open = useCallback(async (row: Application) => {
    setSelected(row); setNote(row.review_note); setTestStatus(row.test_status); setMessage(''); setDetailStatus('');
    if (!row.first_viewed_at) {
      try {
        const viewed = await markApplicationViewed(row.id);
        setRows(previous => previous.map(item => item.id === row.id ? { ...item, first_viewed_at: viewed.first_viewed_at } : item));
        setSelected(previous => previous?.id === row.id ? { ...previous, first_viewed_at: viewed.first_viewed_at } : previous);
      } catch { setDetailStatus('Viewed 상태를 저장하지 못했습니다. 새로고침 후 다시 열어 주세요.'); }
    }
  }, []);
  useEffect(() => {
    if (loading || linkedApplicationOpened.current) return;
    const id = new URLSearchParams(window.location.search).get('application');
    linkedApplicationOpened.current = true;
    if (id) {
      const row = rows.find(item => item.id === id);
      if (row) void open(row);
      else if (!status) setStatus('링크의 지원서를 찾을 수 없습니다.');
    }
  }, [loading, rows, open, status]);
  async function toggleStar(row: Application) {
    if (starBusy || busy) return;
    setStarBusy(row.id);
    try {
      const updated = await shortlistApplication(row.id, !row.shortlisted);
      setRows(previous => previous.map(item => item.id === row.id ? { ...item, shortlisted: updated.shortlisted } : item));
      setSelected(previous => previous?.id === row.id ? { ...previous, shortlisted: updated.shortlisted } : previous);
    } catch {
      if (selected?.id === row.id) setDetailStatus('Shortlist를 저장하지 못했습니다. 다시 시도하세요.');
      else setStatus('Shortlist를 저장하지 못했습니다. 다시 시도하세요.');
    }
    finally { setStarBusy(null); }
  }
  async function save(action?: ReviewAction, noteOnly = false) {
    if (!selected || busy || starBusy) return;
    const link = action === 'invite' ? testLink.trim() : onboardingLink.trim();
    if ((action === 'invite' || action === 'approve') && !validLink(link)) {
      setDetailStatus('메시지에 넣을 올바른 링크를 먼저 입력하세요.'); return;
    }
    setBusy(true); setDetailStatus(''); setMessage('');
    try {
      const updated = await updateApplication(selected.id, {
        ...(noteOnly ? {} : { test_status: testStatus }), review_note: note, ...(action ? actionChanges(action) : {}),
      });
      setRows(previous => previous.map(row => row.id === updated.id ? updated : row));
      setSelected(previous => previous?.id === updated.id ? updated : previous);
      if (!noteOnly) setTestStatus(updated.test_status);
      if (action) setMessage(applicationMessage(action, updated, link));
      setDetailStatus('저장했습니다.');
    } catch { setDetailStatus('저장하지 못했습니다. 다시 시도하세요.'); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(message); setDetailStatus('메시지를 복사했습니다.'); }
    catch { setDetailStatus('자동 복사가 제한되었습니다. 아래 메시지를 선택해 직접 복사하세요.'); }
  }
  const visible = selectApplications(rows, filters, search, sort);
  const languageOptions = (key: 'partner_languages' | 'native_languages') => [...new Set(rows.flatMap(row => row[key] || []))].sort();
  function filterSelect(key: keyof ApplicationFilters, label: string, options: [string, string][]) {
    return <label key={key} className="min-w-0 text-xs font-medium">{label}<select aria-label={label} className={inputClass} value={filters[key]} onChange={event => setFilters(previous => ({ ...previous, [key]: event.target.value }))}>
      <option value="">All</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select></label>;
  }
  function star(row: Application) {
    return <button type="button" aria-label={`Shortlist ${row.full_name}`} aria-pressed={!!row.shortlisted} disabled={!!starBusy || busy} onClick={() => void toggleStar(row)} className="shrink-0 rounded px-2 py-1 text-lg text-amber-600 disabled:opacity-50">{row.shortlisted ? '★' : '☆'}</button>;
  }
  function indicators(row: Application) {
    return <>{!row.first_viewed_at && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">New</span>}{row.review_note.trim() && <span title="Review note saved" aria-label="Review note saved" className="text-xs text-muted-foreground">Note</span>}</>;
  }
  const visaLabel = (row: Application) => row.visa_type === 'outside_korea' ? 'Overseas' : row.visa_type === 'Other' ? 'Other visa' : row.visa_type;
  const submitted = (row: Application) => new Date(row.submitted_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Seoul' });
  return <div className="partner-applications-page">
    <AdminHeader title="Partner Applications" />
    <main className="space-y-5 p-4 md:p-6">
      <a href="/admin/dashboard" className="text-sm underline md:hidden">Admin home</a>
      <div className="flex flex-wrap gap-2">
        {['all', 'new', 'ready', 'review', 'hold'].map(value => <Button key={value} variant={(value === 'new' ? filters.viewed === 'new' : value === 'all' ? !filters.review && !filters.viewed : filters.review === value) ? 'default' : 'outline'} onClick={() => setFilters(previous => ({ ...previous, viewed: value === 'new' ? 'new' : '', review: ['ready','review','hold'].includes(value) ? value : '' }))}>
          {value[0].toUpperCase() + value.slice(1)} [{rows.filter(row => value === 'all' || (value === 'new' ? !row.first_viewed_at : row.review_status === value)).length}]
        </Button>)}
        <Button variant="outline" onClick={() => void load()} disabled={loading || busy || !!starBusy}>Refresh</Button>
      </div>
      <section aria-label="Application search and filters" className="space-y-3 rounded border p-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_230px]">
          <label className="text-xs font-medium">Search applications<input aria-label="Search applications" type="search" className={inputClass} value={search} onChange={event => setSearch(event.target.value)} placeholder="Name, email, university, nationality, languages" /></label>
          <label className="text-xs font-medium">Sort<select aria-label="Sort" className={inputClass} value={sort} onChange={event => setSort(event.target.value as ApplicationSort)}>{[['newest','Newest'],['oldest','Oldest'],['score','Review score: High → Low'],['capacity','Weekly capacity: High → Low'],['name','Name A–Z']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <details><summary className="cursor-pointer text-sm font-medium">Filters {Object.values(filters).filter(Boolean).length > 0 && `(${Object.values(filters).filter(Boolean).length})`}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {filterSelect('viewed','New / Viewed',[['new','New'],['viewed','Viewed']])}
            {filterSelect('review','Review status',['ready','review','hold'].map(value => [value,value[0].toUpperCase()+value.slice(1)]))}
            {filterSelect('final','Final status',['pending','approved','rejected','hold'].map(value => [value,value[0].toUpperCase()+value.slice(1)]))}
            {filterSelect('session','Session language',languageOptions('partner_languages').map(value => [value,value]))}
            {filterSelect('native','Native language',languageOptions('native_languages').map(value => [value,value]))}
            {filterSelect('residence','Current residence',[['korea','Korea resident'],['overseas','Overseas'],['unknown','Not collected (legacy)']])}
            {filterSelect('visa','Visa type',[['D-2','D-2'],['D-4','D-4'],['F-series','F-series'],['Other','Other visa'],['outside_korea','Not applicable — overseas']])}
            {filterSelect('capacity','Weekly capacity',['1-2','3-5','6-10','10+'].map(value => [value,value]))}
            {filterSelect('availability','Availability · KST', ['weekday','weekend'].flatMap(day => Object.entries(periodLabels).map(([period,label]): [string,string] => [`${day}_${period}`,`${day === 'weekday' ? 'Weekdays' : 'Weekends'} · ${label}`])))}
            {filterSelect('source','Acquisition source',[...new Set([...Object.keys(sourceLabels),...rows.map(row => String(row.acquisition_source || '')).filter(Boolean)])].map(value => [value,sourceLabels[value] || value]))}
            {filterSelect('shortlist','Shortlist',[['only','Shortlisted only']])}
          </div>
        </details>
        <div className="flex items-center justify-between gap-2"><span className="text-sm text-muted-foreground">{visible.length} / {rows.length} applications · dates in KST</span><Button variant="outline" onClick={() => { setFilters({ ...emptyFilters }); setSearch(''); }}>Clear filters</Button></div>
      </section>
      <p role="status">{loading ? 'Loading…' : status}</p>
      {!loading && !status && !rows.length && <p>아직 지원서가 없습니다.</p>}
      {!loading && !!rows.length && !visible.length && <p>조건에 맞는 지원서가 없습니다.</p>}
      <div className="hidden overflow-x-auto rounded border md:block">
        <table className="w-full text-left text-sm"><thead><tr>{['Shortlist','Name','Nationality','Session languages','Visa / residence','Weekly capacity','Score / Review','Test / Final','Submitted'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead>
          <tbody>{visible.map(row => <tr key={row.id} className="border-t">
            <td className="p-2">{star(row)}</td>
            <td className="p-3"><button className="break-words text-left underline" onClick={() => void open(row)}>{row.full_name}</button><div className="mt-1 flex gap-2">{indicators(row)}</div></td>
            <td className="p-3">{row.nationality}</td><td className="p-3">{row.partner_languages.join(', ')}</td><td className="p-3">{visaLabel(row)}<div className="text-xs text-muted-foreground">{applicationResidence(row) === 'korea' ? 'Korea' : row.current_country || '—'}</div></td><td className="p-3">{row.weekly_session_capacity}</td>
            <td className="p-3">{row.review_score}/7 · {row.review_status}</td><td className="p-3">{row.test_status} / {row.final_status}</td><td className="whitespace-nowrap p-3">{submitted(row)}</td>
          </tr>)}</tbody></table>
      </div>
      <div className="space-y-3 md:hidden">{visible.map(row => <article key={row.id} className="space-y-2 rounded border p-3 text-sm">
        <div className="flex items-start gap-2">{star(row)}<div className="min-w-0 flex-1"><button className="break-words text-left font-semibold underline" onClick={() => void open(row)}>{row.full_name}</button><div className="mt-1 flex gap-2">{indicators(row)}</div></div></div>
        <p className="break-words">{row.nationality} · {row.partner_languages.join(', ')}</p><p>{visaLabel(row)} · {row.current_country || 'Location not collected'} · {row.weekly_session_capacity}/week</p>
        <p>{row.review_score}/7 · {row.review_status} · {row.final_status}</p><p className="text-xs text-muted-foreground">{submitted(row)}</p>
      </article>)}</div>
      <Dialog open={!!selected} onOpenChange={value => { if (!value && !busy) setSelected(null); }}>
        <DialogContent aria-describedby="application-review-description" className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.full_name}</DialogTitle><p id="application-review-description" className="text-sm text-muted-foreground">전체 답변 검토 및 상태 관리. 메시지는 직접 복사해 전달하세요.</p></DialogHeader>
          {selected && <>
            <section aria-label="Review tools" className="space-y-3 rounded border p-3">
              <div className="flex flex-wrap items-center gap-2">{star(selected)}<span className="text-sm">Shortlist</span><span className="text-xs text-muted-foreground">{selected.first_viewed_at ? 'Viewed' : 'New'}</span></div>
              <label className="text-sm">Review note<textarea aria-label="Review note" className={inputClass} value={note} maxLength={5000} rows={3} onChange={event => setNote(event.target.value)} disabled={busy} /></label>
              <Button variant="outline" disabled={busy || !!starBusy} onClick={() => void save(undefined, true)}>Save note</Button>
              {detailStatus && <p className="text-sm">{detailStatus}</p>}
            </section>
            <ApplicantMedia key={selected.id} applicant={selected} />
            <dl className="grid gap-3 sm:grid-cols-2">{profileSummary(selected).map(({ label, value }) => <div key={label} className="rounded border p-3"><dt className="text-sm font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm">{value}</dd></div>)}</dl>
            <details><summary className="cursor-pointer font-medium">All answers & review history</summary><dl className="mt-3 space-y-3">{Object.entries(selected).filter(([key, value]) => !['intro_video_path','media_upload_id'].includes(key) && (key !== 'motivation' || !!value)).map(([key, value]) => <div key={key} className="grid gap-1 border-b pb-2 sm:grid-cols-[180px_1fr]"><dt className="font-medium">{key.replaceAll('_', ' ')}</dt><dd className="whitespace-pre-wrap break-words">{Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : typeof value === 'object' && value ? JSON.stringify(value, null, 2) : String(value ?? '—')}</dd></div>)}</dl></details>
            <label className="text-sm">Test status<select className={inputClass} value={testStatus} onChange={event => setTestStatus(event.target.value as Application['test_status'])} disabled={busy}>{['not_invited','invited','scheduled','completed'].map(value => <option key={value}>{value}</option>)}</select></label>
            <Button variant="outline" disabled={busy} onClick={() => void save()}>Save note & test status</Button>
            <label className="text-sm">Test booking link<input type="url" className={inputClass} value={testLink} onChange={event => setTestLink(event.target.value)} placeholder="https://…" disabled={busy} /></label>
            <label className="text-sm">Onboarding link<input type="url" className={inputClass} value={onboardingLink} onChange={event => setOnboardingLink(event.target.value)} placeholder="https://…" disabled={busy} /></label>
            <div className="flex flex-wrap gap-2">{(Object.keys(actionLabels) as ReviewAction[]).map(action => <Button key={action} variant="outline" disabled={busy} onClick={() => void save(action)}>{actionLabels[action]}</Button>)}</div>
            <p role="status" aria-live="polite">{detailStatus}</p>
            {message && <><label>Message<textarea className={inputClass} rows={12} value={message} readOnly /></label><Button onClick={() => void copy()}>Copy</Button></>}
          </>}
        </DialogContent>
      </Dialog>
    </main>
    <style jsx global>{`
      @media (max-width: 767px) {
        body:has(.partner-applications-page) aside { display: none; }
        body:has(.partner-applications-page) aside + div { margin-left: 0; }
        .partner-applications-page > header { margin-left: 0; padding: 0 1rem; }
        .partner-applications-page > header > div:first-child { max-width: 45%; }
        .partner-applications-page > header > div:first-child > a,
        .partner-applications-page > header > div:last-child > span,
        .partner-applications-page > header > div:last-child > div { display: none; }
        .partner-applications-page > header > div:last-child { gap: 0.25rem; }
      }
    `}</style>
  </div>;
}
