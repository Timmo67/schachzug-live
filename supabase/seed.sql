-- Local stack only (runs after migrations on `supabase start` / `db reset`): the database reaches the
-- local Edge Functions through Kong on the Docker network instead of the production URL.
update public.push_settings set function_url = 'http://supabase_kong_schachzug-live:8000/functions/v1/send-push';
