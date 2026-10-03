"use client";
import { useCallback, useEffect, useState } from 'react';
import { AdminHeader } from '@/components/admin/header';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { actionChanges, applicationMedia, applicationMessage, listApplications, profileSummary, updateApplication, type Application, type ReviewAction } from '@/lib/partner-applications';

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
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setMedia({ video: null });
    applicationMedia(applicant).then(result => { if (active) setMedia(result); })
      .catch(() => { if (active) setError('비공개 파일을 불러오지 못했습니다. 관리자 권한과 Storage 정책을 확인하세요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applicant, refresh]);
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
  const [filter, setFilter] = useState('all');
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
  function open(row: Application) {
    setSelected(row); setNote(row.review_note); setTestStatus(row.test_status); setMessage(''); setDetailStatus('');
  }
  async function save(action?: ReviewAction) {
    if (!selected || busy) return;
    const link = action === 'invite' ? testLink.trim() : onboardingLink.trim();
    if ((action === 'invite' || action === 'approve') && !validLink(link)) {
      setDetailStatus('메시지에 넣을 올바른 링크를 먼저 입력하세요.'); return;
    }
    setBusy(true); setDetailStatus(''); setMessage('');
    try {
      const updated = await updateApplication(selected.id, {
        test_status: testStatus, review_note: note, ...(action ? actionChanges(action) : {}),
      });
      setRows(previous => previous.map(row => row.id === updated.id ? updated : row));
      setSelected(updated); setTestStatus(updated.test_status);
      if (action) setMessage(applicationMessage(action, updated, link));
      setDetailStatus('저장했습니다.');
    } catch { setDetailStatus('저장하지 못했습니다. 다시 시도하세요.'); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(message); setDetailStatus('메시지를 복사했습니다.'); }
    catch { setDetailStatus('자동 복사가 제한되었습니다. 아래 메시지를 선택해 직접 복사하세요.'); }
  }
  return <>
    <AdminHeader title="Partner Applications" />
    <main className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap gap-2">
        {['all', 'ready', 'review', 'hold'].map(value => <Button key={value} variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)}>
          {value === 'all' ? 'All' : value[0].toUpperCase() + value.slice(1)} [{rows.filter(row => value === 'all' || row.review_status === value).length}]
        </Button>)}
        <Button variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button>
      </div>
      <p role="status">{loading ? 'Loading…' : status}</p>
      {!loading && !status && !rows.length && <p>아직 지원서가 없습니다.</p>}
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-left text-sm"><thead><tr>{['Name','Nationality','Partner language','Visa','Weekly capacity','Review','Test / Final','Submitted'].map(label => <th key={label} className="whitespace-nowrap p-3">{label}</th>)}</tr></thead>
          <tbody>{rows.filter(row => filter === 'all' || row.review_status === filter).map(row => <tr key={row.id} className="border-t">
            <td className="p-3"><button className="text-left underline" onClick={() => open(row)}>{row.full_name}</button></td>
            <td className="p-3">{row.nationality}</td><td className="p-3">{row.partner_languages.join(', ')}</td><td className="p-3">{row.visa_type}</td><td className="p-3">{row.weekly_session_capacity}</td>
            <td className="p-3">{row.review_status} ({row.review_score}/7)</td><td className="p-3">{row.test_status} / {row.final_status}</td><td className="whitespace-nowrap p-3">{new Date(row.submitted_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Seoul' })}</td>
          </tr>)}</tbody></table>
      </div>
      <Dialog open={!!selected} onOpenChange={value => { if (!value && !busy) setSelected(null); }}>
        <DialogContent aria-describedby="application-review-description" className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>{selected?.full_name}</DialogTitle><p id="application-review-description" className="text-sm text-muted-foreground">전체 답변 검토 및 상태 관리. 메시지는 직접 복사해 전달하세요.</p></DialogHeader>
          {selected && <>
            <ApplicantMedia key={selected.id} applicant={selected} />
            <dl className="grid gap-3 sm:grid-cols-2">{profileSummary(selected).map(({ label, value }) => <div key={label} className="rounded border p-3"><dt className="text-sm font-semibold">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm">{value}</dd></div>)}</dl>
            <details><summary className="cursor-pointer font-medium">All answers & review history</summary><dl className="mt-3 space-y-3">{Object.entries(selected).filter(([key, value]) => !['intro_video_path','media_upload_id'].includes(key) && (key !== 'motivation' || !!value)).map(([key, value]) => <div key={key} className="grid gap-1 border-b pb-2 sm:grid-cols-[180px_1fr]"><dt className="font-medium">{key.replaceAll('_', ' ')}</dt><dd className="whitespace-pre-wrap break-words">{Array.isArray(value) ? value.join(', ') : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : typeof value === 'object' && value ? JSON.stringify(value, null, 2) : String(value ?? '—')}</dd></div>)}</dl></details>
            <label className="text-sm">Review note<textarea className={inputClass} value={note} maxLength={5000} onChange={event => setNote(event.target.value)} disabled={busy} /></label>
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
  </>;
}
