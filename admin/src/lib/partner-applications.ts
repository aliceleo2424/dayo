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
  [key: string]: string | number | boolean | string[] | null;
};
export type ReviewAction = 'invite' | 'hold' | 'approve' | 'reject';

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
