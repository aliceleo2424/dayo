import { supabase } from '@/lib/supabase';

export const GUIDEBOOK_SOURCE = 'speaking_sense_guidebook';
export const LEAD_COLUMNS = 'id,email,source,created_at,guidebook_sent_at,marketing_consent,marketing_consented_at,marketing_withdrawn_at';
export type GuidebookLead = {
  id: string; email: string; source: string; created_at: string;
  guidebook_sent_at: string | null; marketing_consent: boolean;
  marketing_consented_at: string | null; marketing_withdrawn_at: string | null;
};
export type LeadFilter = 'all' | 'consented' | 'not_consented' | 'withdrawn' | 'unsent';
export const filterLabels: Record<LeadFilter, string> = {
  all: '전체', consented: '마케팅 동의', not_consented: '미동의', withdrawn: '철회', unsent: '발송 실패 / 미완료',
};
export type LeadSummary = { total: number; consented: number; consentRate: number; unsent: number; withdrawn: number; archived: number };

export function marketingEligible(row: GuidebookLead) {
  return row.source === GUIDEBOOK_SOURCE && row.marketing_consent === true && row.marketing_withdrawn_at === null;
}
export function filterLeads(rows: GuidebookLead[], filter: LeadFilter, search = '') {
  const query = search.trim().toLowerCase();
  return rows.filter(row => row.source === GUIDEBOOK_SOURCE && (!query || row.email.toLowerCase().includes(query)) && (
    filter === 'all' ||
    (filter === 'consented' && marketingEligible(row)) ||
    (filter === 'not_consented' && !row.marketing_consent && row.marketing_withdrawn_at === null) ||
    (filter === 'withdrawn' && row.marketing_withdrawn_at !== null) ||
    (filter === 'unsent' && row.guidebook_sent_at === null)
  ));
}
export function summarizeLeads(rows: GuidebookLead[]): LeadSummary {
  const data = rows.filter(row => row.source === GUIDEBOOK_SOURCE);
  const consented = data.filter(row => row.marketing_consented_at !== null).length;
  return { total: data.length, consented, consentRate: data.length ? consented / data.length * 100 : 0,
    unsent: data.filter(row => row.guidebook_sent_at === null).length,
    withdrawn: data.filter(row => row.marketing_withdrawn_at !== null).length, archived: 0 };
}
export async function listGuidebookLeads(): Promise<GuidebookLead[]> {
  const rows: GuidebookLead[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('leads').select(LEAD_COLUMNS)
      .eq('source', GUIDEBOOK_SOURCE).order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(offset, offset + 499);
    if (error) throw new Error('가이드북 리드를 불러오지 못했습니다. 관리자 권한과 연결 상태를 확인해 주세요.');
    rows.push(...(data || []) as GuidebookLead[]);
    if (!data || data.length < 500) return rows;
  }
}
export async function loadGuidebookSummary(rows: GuidebookLead[]) {
  const { data, error } = await supabase.rpc('admin_guidebook_lead_summary');
  // 089 is a separate, unapplied migration. The existing 088 list remains usable.
  if (error?.code === 'PGRST202' || error?.code === '42883') return { summary: summarizeLeads(rows), preserved: false };
  if (error || !data?.[0]) throw new Error('가이드북 집계를 불러오지 못했습니다. 다시 시도해 주세요.');
  const item = data[0];
  const total = Number(item.total), consented = Number(item.consented);
  return { summary: { total, consented, consentRate: total ? consented / total * 100 : 0,
    unsent: Number(item.unsent), withdrawn: Number(item.withdrawn), archived: Number(item.archived) }, preserved: true };
}
export function leadDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}
function csvCell(value: string) {
  // Prevent spreadsheet formula execution, including after leading whitespace.
  const safe = /^[\s\uFEFF]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function guidebookCsv(rows: GuidebookLead[], eligibleOnly = false) {
  const selected = rows.filter(row => row.source === GUIDEBOOK_SOURCE && (!eligibleOnly || marketingEligible(row)));
  const headers = ['이메일', '유입 경로', '신청일(KST)', '가이드북 발송일(KST)', '마케팅 동의', '동의일(KST)', '철회일(KST)', '현재 마케팅 발송 가능'];
  const lines = selected.map(row => [row.email, row.source, leadDate(row.created_at), leadDate(row.guidebook_sent_at),
    row.marketing_consent ? '동의' : '미동의', leadDate(row.marketing_consented_at), leadDate(row.marketing_withdrawn_at), marketingEligible(row) ? '가능' : '불가']);
  return '\uFEFF' + [headers, ...lines].map(line => line.map(csvCell).join(',')).join('\r\n');
}
