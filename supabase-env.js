/* DayO public browser env (NEXT_PUBLIC_* — client-safe values only) */
(function () {
  'use strict';
  var rawUrl = 'https://mmhapsimcngmtefqfrcg.supabase.co/rest/v1/';
  window.__DAYO_ENV__ = {
    NEXT_PUBLIC_SUPABASE_URL: String(rawUrl).replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, ''),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1taGFwc2ltY25nbXRlZnFmcmNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzNDIwMTgsImV4cCI6MjEwMTkxODAxOH0.aXN0zgjWNqlxxLtygfuTdLlKIf52Ks_oyx2GTd7T0Oo',
    NEXT_PUBLIC_DAILY_DOMAIN: 'dayo-live.daily.co',
    NEXT_PUBLIC_GEMINI_API_KEY: ''
  };
})();
