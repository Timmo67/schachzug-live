import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import type { Browser, BrowserContextOptions, Page } from '@playwright/test';

// Runs against the local Supabase stack only (E2E_ONLINE=1, see playwright.config.ts).
// Keys come from the running local stack (`supabase status`), so nothing secret-looking lives in the repo.
const local = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' })) as Record<string, string>;
export const URL = local.API_URL;
export const PUBLISHABLE = local.PUBLISHABLE_KEY;
export const SECRET = local.SECRET_KEY;
export const STORAGE_KEY = 'sb-127-auth-token';

export const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

/**
 * Test account created through the admin API (skips the closed-beta invite check). By default it is
 * set back to the free plan so the Plus/free rules can be tested; pass beta=true to keep beta Plus.
 */
export async function makeUser(name: string, beta = false) {
  const email = `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  const password = 'test-password-123';
  const token = `t-${Math.random().toString(36).slice(2)}${Date.now()}`;
  await admin.from('beta_admin_tokens').insert({ token });
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: name, beta_token: token },
  });
  if (error) throw error;
  if (!beta) await admin.from('entitlements').update({ plan: 'free', source: 'none' }).eq('user_id', data.user.id);
  const client = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, session: s.session };
}

/** A browser context that is already signed in (session injected before the app boots). */
export async function signedInPage(browser: Browser, session: unknown, options: BrowserContextOptions = {}): Promise<Page> {
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], ...options });
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(session)]);
  return ctx.newPage();
}

export async function move(page: Page, from: string, to: string) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}
