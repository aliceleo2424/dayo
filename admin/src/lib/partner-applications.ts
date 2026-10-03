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
  current_country?: string | null;
  native_languages?: string[] | null;
  other_language_proficiencies?: Record<string, string>;
  acquisition_source_other?: string;
  intro_video_language?: string | null;
  intro_video_path?: string | null;
  [key: string]: string | number | boolean | string[] | Record<string, string> | null | undefined;
};
export type ReviewAction = 'invite' | 'hold' | 'approve' | 'reject';

const proficiencyLabels: Record<string, string> = { basic: 'Basic', conversational: 'Conversational', fluent: 'Fluent', native: 'Native / near-native' };
const sourceLabels: Record<string, string> = {
  friend_referral: 'Friend / referral', instagram: 'Instagram', facebook_group: 'Facebook group', university_community: 'University community',
  international_student_community: 'International student community', job_board: 'Job board', reddit_discord: 'Reddit / Discord',
  google_search: 'Google search', flyer_qr: 'Flyer / QR poster', other: 'Other',
};
const periodLabels: Record<string, string> = { early_morning: 'Early morning · 6:00 AM–9:00 AM', morning: 'Morning · 9:00 AM–12:00 PM', afternoon: 'Afternoon · 12:00 PM–5:00 PM', evening: 'Evening · 5:00 PM–10:00 PM', late_night: 'Late night · 10:00 PM–1:00 AM (following day)' };
export function profileSummary(app: Application) {
  const structured = Array.isArray(app.native_languages);
  const other = Object.entries(app.other_language_proficiencies || {}).map(([language, level]) => `${language}: ${proficiencyLabels[level] || level}`).join('\n');
  const periods = Array.isArray(app.availability_periods) ? app.availability_periods.map(period => {
    const [day, ...time] = period.split('_');
    const slot = time.join('_');
    return `${day === 'weekday' ? 'Weekdays' : 'Weekends'} · ${structured ? periodLabels[slot] || slot : slot + ' (legacy time band)'}`;
  }).join('\n') : '—';
  return [
    ['Current location', [app.current_city, app.current_country].filter(Boolean).join(', ')],
    ['Visa / overseas', app.visa_type === 'outside_korea' ? 'Not applicable — currently living outside Korea' : app.visa_type === 'Other' ? 'Other visa' : app.visa_type],
    ['Native languages', structured ? app.native_languages?.join(', ') : 'Not collected (legacy application)'],
    ['Other languages + proficiency', other || app.other_languages || '—'],
    ['DayO session languages', app.partner_languages.join(', ')],
    ['Introduction video language', app.intro_video_language || 'Not collected (legacy application)'],
    ['Korean level', app.korean_level === 'none' ? 'None' : app.korean_level === 'advanced' ? 'Advanced' : proficiencyLabels[String(app.korean_level)] || app.korean_level],
    ['Weekly capacity', app.weekly_session_capacity + ' sessions'],
    ['Availability · KST (UTC+9)', periods],
    ['Acquisition source', [sourceLabels[String(app.acquisition_source)] || app.acquisition_source, app.acquisition_source === 'other' ? app.acquisition_source_other : null].filter(Boolean).join(' · ') || '—'],
  ].map(([label, value]) => ({ label: String(label), value: String(value || '—') }));
}

export async function applicationMedia(app: Application) {
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
  const { data, error } = await supabase.from('partner_applications').select('*').order('submitted_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Application[];
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
