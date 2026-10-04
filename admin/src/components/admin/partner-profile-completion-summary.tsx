'use client';
import { useEffect, useState } from 'react';
import { fetchPartnerProfileDetails, partnerProfileDetailsRows, type PartnerProfileDetails } from '@/lib/partner-profile-details';

export function PartnerProfileCompletionSummary({ partnerId }: { partnerId: string }) {
  const [state, setState] = useState<{ id: string; details: PartnerProfileDetails | null; error: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    fetchPartnerProfileDetails(partnerId).then(details => {
      if (active) setState({ id: partnerId, details, error: null });
    }).catch((error: Error) => {
      if (active) setState({ id: partnerId, details: null, error: error.message });
    });
    return () => { active = false; };
  }, [partnerId]);
  return <section className="rounded-xl border bg-[#FFFCFA] p-4" aria-label="Partner profile completion">
    <h3 className="mb-1 font-semibold">Partner profile completion</h3>
    <p className="mb-3 text-xs text-muted-foreground">Self-declared information. Separate from admin-verified capabilities and existing visa records.</p>
    {!state || state.id !== partnerId ? <p className="text-sm">Loading profile…</p> : state.error ? <p role="status" className="text-sm text-muted-foreground">{state.error}</p> :
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{partnerProfileDetailsRows(state.details).map(([label,value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl>}
  </section>;
}
