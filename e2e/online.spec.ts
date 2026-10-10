import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Runs against the local Supabase stack only (E2E_ONLINE=1, see playwright.config.ts).
// Keys come from the running local stack (`supabase status`), so nothing secret-looking lives in the repo.
const local = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' })) as Record<string, string>;
const URL = local.API_URL;
const PUBLISHABLE = local.PUBLISHABLE_KEY;
const SECRET = local.SECRET_KEY;
const STORAGE_KEY = 'sb-127-auth-token';

const admin = createClient(URL, SECRET, { auth: { persistSession: false } });

async function makeUser(name: string) {
  const email = `${name.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
  const password = 'test-password-123';
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name: name },
  });
  if (error) throw error;
  const client = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await client.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  return { id: data.user.id, session: s.session };
}

/** A browser context that is already signed in (session injected before the app boots). */
async function signedInPage(browser: Browser, session: unknown): Promise<Page> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(session)]);
  return ctx.newPage();
}

async function move(page: Page, from: string, to: string) {
  await page.locator(`[data-square="${from}"]`).click();
  await page.locator(`[data-square="${to}"]`).click();
}

test('two friends play a full game with clock, chat and a reload in the middle', async ({ browser }) => {
  test.setTimeout(120_000);
  const anna = await makeUser('Anna');
  const ben = await makeUser('Ben');
  const { error } = await admin.from('friendships').insert({ requester_id: anna.id, addressee_id: ben.id, status: 'accepted' });
  expect(error).toBeNull();

  const a = await signedInPage(browser, anna.session);
  const b = await signedInPage(browser, ben.session);

  // Anna challenges Ben: 10 minutes, she plays White.
  await a.goto('/freunde');
  await a.getByRole('button', { name: 'Herausfordern' }).click();
  await a.getByRole('button', { name: '10 Min.' }).click();
  await a.getByRole('button', { name: 'Weiß' }).click();
  await a.getByRole('button', { name: 'Herausforderung senden' }).click();
  await expect(a).toHaveURL(/\/partie\//);
  await expect(a.getByTestId('status')).toContainText('Warte, bis Ben annimmt');

  // Ben sees the challenge live and accepts.
  await b.goto('/partien');
  await expect(b.getByTestId('incoming')).toContainText('Anna');
  await b.getByRole('button', { name: 'Annehmen' }).click();
  await expect(b).toHaveURL(a.url());
  await expect(a.getByTestId('status')).toHaveText('Du bist am Zug');
  await expect(b.getByTestId('status')).toHaveText('Anna ist am Zug');
  await expect(a.getByTestId('clock-w')).toHaveText('10:00');

  const plies: Array<[Page, string, string]> = [
    [a, 'e2', 'e4'], [b, 'e7', 'e5'], [a, 'f1', 'c4'], [b, 'b8', 'c6'], [a, 'd1', 'h5'],
  ];
  for (const [p, from, to] of plies) {
    await expect(p.getByTestId('status')).toHaveText('Du bist am Zug');
    await move(p, from, to);
  }

  // Reload in the middle of the game: Ben's page comes back with the same position.
  await b.reload();
  await expect(b.getByTestId('moves')).toContainText('Qh5');
  await expect(b.getByTestId('status')).toHaveText('Du bist am Zug');

  // Chat goes both ways.
  await b.getByLabel('Nachricht').fill('Gut gespielt bisher!');
  await b.getByRole('button', { name: 'Senden' }).click();
  await expect(a.getByTestId('chat')).toContainText('Gut gespielt bisher!');

  await move(b, 'g8', 'f6');
  await expect(a.getByTestId('status')).toHaveText('Du bist am Zug');
  await move(a, 'h5', 'f7');

  await expect(a.getByTestId('status')).toHaveText('Du gewinnst – Schachmatt');
  await expect(b.getByTestId('status')).toHaveText('Du verlierst – Schachmatt');
  await expect(b.getByTestId('moves')).toContainText('Qxf7#');

  // The server stored the game; it shows up in the archive.
  await b.goto('/partien');
  await expect(b.getByTestId('archive')).toContainText('Du verlierst – Schachmatt');
});

test('the server rejects a move from the player who is not on turn', async () => {
  const anna = await makeUser('Anna');
  const ben = await makeUser('Ben');
  await admin.from('friendships').insert({ requester_id: anna.id, addressee_id: ben.id, status: 'accepted' });
  const asAnna = createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${anna.session!.access_token}` } } });
  const asBen = createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${ben.session!.access_token}` } } });

  const { data: gameId, error } = await asAnna.rpc('create_game', { p_opponent: ben.id, p_time_control: '5+0', p_color: 'w' });
  expect(error).toBeNull();
  expect((await asBen.rpc('respond_game', { p_game: gameId, p_action: 'accept' })).error).toBeNull();

  const wrong = await asBen.functions.invoke('make-move', { body: { gameId, uci: 'e7e5' } });
  expect(wrong.error).toBeTruthy();
  const illegal = await asAnna.functions.invoke('make-move', { body: { gameId, uci: 'e2e5' } });
  expect(illegal.error).toBeTruthy();
  const ok = await asAnna.functions.invoke('make-move', { body: { gameId, uci: 'e2e4' } });
  expect(ok.error).toBeNull();
  expect(ok.data.game.moves_uci).toEqual(['e2e4']);

  // Clients cannot write games directly.
  const direct = await asBen.from('games').update({ result: '0-1' }).eq('id', gameId).select();
  expect(direct.data ?? []).toHaveLength(0);
});
