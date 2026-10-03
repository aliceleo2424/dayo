import { supabase } from '@/lib/supabase';

export type PartnerProfileDetails = {
  partner_id: string;
  location_status: 'korea' | 'overseas' | null;
  visa_type: string | null;
  native_languages: string[] | null;
  other_languages: { language: string; level: string }[];
  session_languages: string[] | null;
  korean_level: string | null;
  availability_periods: string[] | null;
  weekly_session_capacity: string | null;
  partner_guide_acknowledged_at: string | null;
  completed_at: string | null;
};
export async function fetchPartnerProfileDetails(partnerId: string) {
  const result = await supabase.from('partner_profile_details').select('*').eq('partner_id', partnerId).maybeSingle();
  if (result.error) throw new Error('Partner profile completion information is currently unavailable.');
  return result.data as PartnerProfileDetails | null;
}
const levels: Record<string,string> = { none:'None', basic:'Basic', conversational:'Conversational', fluent:'Fluent', advanced:'Advanced', native:'Native / near-native' };
const times: Record<string,string> = { early_morning:'6:00 AM–9:00 AM', morning:'9:00 AM–12:00 PM', afternoon:'12:00 PM–5:00 PM', evening:'5:00 PM–10:00 PM', late_night:'10:00 PM–1:00 AM (next day)' };
export function partnerProfileDetailsRows(details: PartnerProfileDetails | null): [string,string][] {
  const d = details;
  const complete = !!(d?.completed_at && d.partner_guide_acknowledged_at && d.location_status && d.visa_type && d.korean_level && d.weekly_session_capacity && d.native_languages?.length && d.session_languages?.length && d.availability_periods?.length);
  return [
    ['Profile', complete ? 'Profile complete' : 'Profile incomplete'],
    ['Guide', d?.partner_guide_acknowledged_at ? 'Guide read · ' + new Date(d.partner_guide_acknowledged_at).toLocaleString() : 'Not acknowledged'],
    ['Location', d?.location_status === 'korea' ? 'Korea resident' : d?.location_status === 'overseas' ? 'Overseas' : 'Not provided'],
    ['Visa (self-declared)', d?.visa_type === 'not_applicable_overseas' ? 'Not applicable — currently living outside Korea' : d?.visa_type || 'Not provided'],
    ['Native languages', d?.native_languages?.join(', ') || 'Not provided'],
    ['Other languages', d?.other_languages?.map(l => l.language + ' — ' + (levels[l.level] || l.level)).join(', ') || 'None provided'],
    ['Session languages', d?.session_languages?.join(', ') || 'Not provided'],
    ['Korean level', levels[d?.korean_level || ''] || 'Not provided'],
    ['Weekly capacity', d?.weekly_session_capacity || 'Not provided'],
    ['Availability (KST)', d?.availability_periods?.map(period => {
      const day = period.startsWith('weekday_') ? 'Weekdays' : 'Weekends';
      return day + ' · ' + (times[period.replace(/^(weekday|weekend)_/, '')] || period);
    }).join(', ') || 'Not provided'],
    ['Completed', d?.completed_at ? new Date(d.completed_at).toLocaleString() : 'Not completed'],
  ];
}
