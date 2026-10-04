import { supabase } from '@/lib/supabase';

export type Application = {
  id: string;
  full_name: string;
  email: string;
  nationality: string;
  partner_languages: string[];
  visa_type: string;
  weekly_session_capacity: string;
  review_score: number;
  review_status: 'ready' | 'review' | 'hold';
  test_status: 'not_invited' | 'invited' | 'scheduled' | 'completed';
  final_status: 'pending' | 'approved' | 'rejected' | 'hold';
  review_note: string;
  submitted_at: string;
  first_viewed_at?: string | null;
  shortlisted?: boolean;
  current_country?: string | null;
  current_city?: string | null;
  location_status?: string | null;
  korea_city_other?: string | null;
  native_languages?: string[] | null;
  other_language_proficiencies?: Record<string, string>;
  acquisition_source_other?: string;
  intro_video_language?: string | null;
  intro_video_path?: string | null;
  [key: string]: string | number | boolean | string[] | Record<string, string> | null | undefined;
};
export type ReviewAction = 'invite' | 'hold' | 'approve' | 'reject';

const proficiencyLabels: Record<string, string> = { basic: 'Basic', conversational: 'Conversational', fluent: 'Fluent', native: 'Native / near-native' };
export const sourceLabels: Record<string, string> = {
  friend_referral: 'Friend / referral', instagram: 'Instagram', facebook_group: 'Facebook group', university_community: 'University community',
  international_student_community: 'International student community', job_board: 'Job board', reddit_discord: 'Reddit / Discord',
  google_search: 'Google search', flyer_qr: 'Flyer / QR poster', other: 'Other',
};

export type ApplicationFilters = {
  viewed: string; review: string; final: string; session: string; native: string;
  country: string; city: string; residence: string; visa: string; capacity: string; source: string; shortlist: string;
};
export const emptyFilters: ApplicationFilters = { viewed: '', review: '', final: '', session: '', native: '', country: '', city: '', residence: '', visa: '', capacity: '', source: '', shortlist: '' };
export type ApplicationSort = 'newest' | 'oldest' | 'score' | 'capacity' | 'name';
export function applicationResidence(app: Application) {
  if (app.location_status === 'korea' || app.location_status === 'overseas') return app.location_status;
  if (app.current_country?.trim()) return ['korea','south korea','republic of korea','한국','대한민국'].includes(app.current_country.trim().toLowerCase()) ? 'korea' : 'overseas';
  return ['outside_korea','not_applicable_overseas'].includes(app.visa_type) ? 'overseas' : 'unknown';
}
export function selectApplications(rows: Application[], filters: ApplicationFilters, search: string, sort: ApplicationSort) {
  const query = search.trim().toLocaleLowerCase();
  const matches = rows.filter(app => {
    if (filters.viewed && (filters.viewed === 'new' ? !!app.first_viewed_at : !app.first_viewed_at)) return false;
    if (filters.review && app.review_status !== filters.review || filters.final && app.final_status !== filters.final) return false;
    if (filters.session && !app.partner_languages.includes(filters.session) || filters.native && !app.native_languages?.includes(filters.native)) return false;
    if (filters.country && app.current_country !== filters.country || filters.city && app.current_city !== filters.city) return false;
    if (filters.residence && applicationResidence(app) !== filters.residence || filters.visa && (['outside_korea','not_applicable_overseas'].includes(app.visa_type) ? 'not_applicable_overseas' : app.visa_type === 'Other' ? 'Other visa' : app.visa_type) !== (filters.visa === 'outside_korea' ? 'not_applicable_overseas' : filters.visa === 'Other' ? 'Other visa' : filters.visa)) return false;
    if (filters.capacity && app.weekly_session_capacity !== filters.capacity) return false;
    if (filters.source && app.acquisition_source !== filters.source || filters.shortlist && !app.shortlisted) return false;
    return !query || [app.full_name, app.email, app.university, app.nationality, app.current_country, app.current_city, app.strongest_language, app.other_languages,
      ...(app.native_languages || []), ...app.partner_languages, ...Object.keys(app.other_language_proficiencies || {})]
      .filter(Boolean).join(' ').toLocaleLowerCase().includes(query);
  });
  const capacities: Record<string, number> = { '1-2': 1, '3-5': 2, '6-10': 3, '10+': 4 };
  return matches.sort((a, b) => {
    let difference = 0;
    if (sort === 'name') difference = a.full_name.localeCompare(b.full_name, 'en', { sensitivity: 'base' });
    if (sort === 'score') difference = b.review_score - a.review_score;
    if (sort === 'capacity') difference = (capacities[b.weekly_session_capacity] || 0) - (capacities[a.weekly_session_capacity] || 0);
    if (difference) return difference;
    const date = new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
    return (sort === 'oldest' ? -date : date) || a.id.localeCompare(b.id);
  });
}
export function profileSummary(app: Application) {
  const structured = Array.isArray(app.native_languages);
  const other = Object.entries(app.other_language_proficiencies || {}).map(([language, level]) => `${language} — ${proficiencyLabels[level] || level}`).join('\n');
  return [
    ['Current location', [app.current_city, app.current_country].filter(Boolean).join(', ')],
    ['Country', app.current_country],
    ['City', app.current_city],
    ['Location', applicationResidence(app) === 'korea' ? 'Korea resident' : applicationResidence(app) === 'overseas' ? 'Overseas' : 'Not collected (legacy application)'],
    ['Visa / overseas', app.visa_type === 'outside_korea' ? 'Not applicable — currently living outside Korea' : app.visa_type === 'Other' ? 'Other visa' : app.visa_type],
    ['Native languages', structured ? app.native_languages?.join(', ') : 'Not collected (legacy application)'],
    ['Other languages + proficiency', other || app.other_languages || '—'],
    ['DayO session languages', app.partner_languages.join(', ')],
    ['Introduction video language', app.intro_video_language || 'Not collected (legacy application)'],
    ['Korean level', app.korean_level === 'none' ? 'None' : app.korean_level === 'advanced' ? 'Advanced' : proficiencyLabels[String(app.korean_level)] || app.korean_level],
    ['Weekly capacity (rough estimate)', app.weekly_session_capacity + ' sessions'],
    ['Acquisition source', [sourceLabels[String(app.acquisition_source)] || app.acquisition_source, app.acquisition_source === 'other' ? app.acquisition_source_other : null].filter(Boolean).join(' · ') || '—'],
  ].map(([label, value]) => ({ label: String(label), value: String(value || '—') }));
}

export async function applicationMedia(app: Pick<Application, 'intro_video_path'>) {
  async function sign(bucket: string, path: string | null | undefined) {
    if (!path) return null;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 120);
    if (error) throw error;
    return data.signedUrl;
  }
  const video = await sign('partner-application-videos', app.intro_video_path);
  return { video };
}

export async function listApplications() {
  // Explicit batches avoid Supabase's default 1,000-row response limit.
  const rows: Application[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('partner_applications').select('*')
      .order('submitted_at', { ascending: false }).order('id').range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data || []) as Application[]);
    if (!data || data.length < 500) break;
  }
  return [...new Map(rows.map(row => [row.id, row])).values()];
}

export async function markApplicationViewed(id: string) {
  const { data, error } = await supabase.rpc('mark_partner_application_viewed', { p_id: id }).single();
  if (error) throw error;
  return data as Application;
}
export async function shortlistApplication(id: string, shortlisted: boolean) {
  const { data, error } = await supabase.from('partner_applications').update({ shortlisted }).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Application;
}

export async function updateApplication(id: string, changes: Partial<Pick<Application, 'review_status' | 'test_status' | 'final_status' | 'review_note'>>) {
  const { data, error } = await supabase.from('partner_applications')
    .update({ ...changes, reviewed_at: new Date().toISOString() }).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Application;
}

export function actionChanges(action: ReviewAction): Partial<Application> {
  switch (action) {
    case 'invite': return { test_status: 'invited', final_status: 'pending', review_status: 'review' };
    case 'hold': return { review_status: 'hold', final_status: 'hold' };
    case 'approve': return { final_status: 'approved' };
    case 'reject': return { final_status: 'rejected' };
  }
}

export function applicationMessage(action: ReviewAction, applicant: Application, link: string) {
  const name = applicant.full_name;
  const language = applicant.partner_languages.join(', ');
  switch (action) {
    case 'invite': return `Hi ${name}!\nThank you for applying to become a DayO Language Partner 😊\n\nWe'd love to invite you to a short online partner test.\n\nThe test is very simple — you'll have a short video conversation\nsimilar to a real DayO session.\nNo lesson preparation is needed.\n\nPlease choose a time that works for you here:\n${link}\n\nSee you soon!\nDayO Team`;
    case 'hold': return `Hi ${name},\nThank you for applying to DayO.\n\nWe've received your application and will keep it in our partner pool\nas we expand availability for ${language}.\n\nWe'll contact you when a suitable opening becomes available.\n\nThank you!\nDayO Team`;
    case 'approve': return `Hi ${name}! 🎉\n\nWe're happy to let you know that you've passed the DayO Partner Test.\n\nYour session rate is:\n₩7,500 per completed 30-minute session.\n\nThe next step is a short onboarding and account setup.\n\n${link}\n\nWelcome to DayO!`;
    case 'reject': return `Thank you for taking the time to apply and participate in the\nDayO Partner Test.\n\nWe won't be moving forward with your application at this time,\nbut we really appreciate your interest in DayO.`;
  }
}
