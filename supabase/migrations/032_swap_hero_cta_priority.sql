-- Preserve existing CTA copy while swapping primary and secondary roles.

update public.site_settings
set
  value = value || jsonb_build_object(
    'primary_cta_text', value ->> 'secondary_cta_text',
    'primary_cta_link', value ->> 'secondary_cta_link',
    'secondary_cta_text', value ->> 'primary_cta_text',
    'secondary_cta_link', value ->> 'primary_cta_link'
  ),
  updated_at = now()
where key = 'hero_section'
  and value ->> 'primary_cta_link' = '#topics'
  and value ->> 'secondary_cta_link' = '#quiz';
