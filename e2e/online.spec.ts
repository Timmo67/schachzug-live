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
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
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

async function friendsWithGame() {
  const anna = await makeUser('Anna');
  const ben = await makeUser('Ben');
  await admin.from('friendships').insert({ requester_id: anna.id, addressee_id: ben.id, status: 'accepted' });
  const as = (u: typeof anna) => createClient(URL, PUBLISHABLE, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${u.session!.access_token}` } },
  });
  const { data: gameId } = await as(anna).rpc('create_game', { p_opponent: ben.id, p_time_control: 'none', p_color: 'w' });
  await as(ben).rpc('respond_game', { p_game: gameId, p_action: 'accept' });
  return { anna, ben, gameId: gameId as string, as };
}

const videoWidth = (p: Page) => p.getByTestId('remote-video').evaluate((v) => (v as HTMLVideoElement).videoWidth).catch(() => 0);

test('video call between the two players with fake cameras', async ({ browser }) => {
  test.setTimeout(120_000);
  const { anna, ben, gameId } = await friendsWithGame();
  const a = await signedInPage(browser, anna.session);
  const b = await signedInPage(browser, ben.session);
  await a.goto(`/partie/${gameId}`);
  await b.goto(`/partie/${gameId}`);
  await expect(a.getByTestId('video-allowance')).toContainText('Gratis-Video: noch');

  // Anna starts; Ben sees her without turning on his own camera.
  await a.getByRole('button', { name: 'Video starten' }).click();
  await expect(a.getByTestId('local-video')).toBeVisible();
  await expect.poll(() => videoWidth(b), { timeout: 30_000 }).toBeGreaterThan(0);

  // Ben turns his camera on; Anna sees him.
  await b.getByRole('button', { name: 'Kamera einschalten' }).click();
  await expect.poll(() => videoWidth(a), { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(a.getByTestId('quality')).toBeVisible();

  // At phone width the board stays fully visible and nothing scrolls sideways.
  await a.setViewportSize({ width: 375, height: 667 });
  expect(await a.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  const board = (await a.getByRole('grid', { name: 'Schachbrett' }).boundingBox())!;
  expect(board.x).toBeGreaterThanOrEqual(0);
  expect(board.x + board.width).toBeLessThanOrEqual(375);
  await a.screenshot({ path: test.info().outputPath('video-mobile.png'), fullPage: true });
  // Scrolled to the board, the opponent shows as picture-in-picture.
  await a.evaluate(() => window.scrollTo(0, 0));
  await expect(a.getByTestId('pip-video')).toBeVisible();

  // Camera off/on keeps the call; hanging up ends it on the other side.
  await a.getByRole('button', { name: 'Kamera aus' }).click();
  await expect(a.getByRole('button', { name: 'Kamera an' })).toBeVisible();
  await b.getByRole('button', { name: 'Beenden' }).click();
  await expect(a.getByTestId('remote-video')).toHaveCount(0);

  // Reload: Anna is still sending, Ben comes back and sees her again after starting.
  await b.reload();
  await expect.poll(() => videoWidth(b), { timeout: 30_000 }).toBeGreaterThan(0);
});

test('free video quota is enforced, Plus of one player unlocks it', async ({ browser }) => {
  const { anna, ben, gameId, as } = await friendsWithGame();
  const week = (await as(anna).rpc('video_status', { p_game: gameId })).data;
  expect(week).toMatchObject({ allowed: true, unlimited: false, remaining_seconds: 600 });

  const { data: ws } = await admin.rpc('video_week_start');
  await admin.from('video_usage').upsert({ user_id: anna.id, week_start: ws, seconds: 600 });
  const a = await signedInPage(browser, anna.session);
  await a.goto(`/partie/${gameId}`);
  await expect(a.getByTestId('video-allowance')).toContainText('aufgebraucht');
  await expect(a.getByRole('button', { name: 'Video starten' })).toBeDisabled();
  expect((await as(anna).functions.invoke('turn-credentials', { body: { gameId } })).error).toBeTruthy();

  await admin.from('entitlements').update({ plan: 'plus', source: 'stripe', active_until: null }).eq('user_id', ben.id);
  await a.reload();
  await expect(a.getByTestId('video-allowance')).toContainText('unbegrenzt');
  await expect(a.getByRole('button', { name: 'Video starten' })).toBeEnabled();
  const ice = await as(anna).functions.invoke('turn-credentials', { body: { gameId } });
  expect(ice.error).toBeNull();
  expect(ice.data.iceServers.length).toBeGreaterThan(0);
});

test('outsiders can neither join the signalling channel nor get ICE servers', async () => {
  const { gameId } = await friendsWithGame();
  const carl = await makeUser('Carl');
  const asCarl = createClient(URL, PUBLISHABLE, { auth: { persistSession: false } });
  await asCarl.auth.setSession({ access_token: carl.session!.access_token, refresh_token: carl.session!.refresh_token });
  await asCarl.realtime.setAuth();
  const result = await new Promise<string>((resolve) => {
    asCarl.channel(`video:${gameId}`, { config: { private: true } }).subscribe((s) => { if (s !== 'CLOSED') resolve(s); });
    setTimeout(() => resolve('TIMEOUT'), 10_000);
  });
  expect(result).toBe('CHANNEL_ERROR');
  expect((await asCarl.functions.invoke('turn-credentials', { body: { gameId } })).error).toBeTruthy();
});

test('notifications: challenge, badge and opponent move reach the other player anywhere in the app', async ({ browser }) => {
  const anna = await makeUser('Anna');
  const ben = await makeUser('Ben');
  await admin.from('friendships').insert({ requester_id: anna.id, addressee_id: ben.id, status: 'accepted' });
  const asAnna = createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${anna.session!.access_token}` } } });

  const b = await signedInPage(browser, ben.session);
  await b.goto('/');
  await expect(b.getByRole('heading', { name: /Hallo Ben/ })).toBeVisible();
  await b.waitForTimeout(1500); // let the change feed come up

  const { data: gameId } = await asAnna.rpc('create_game', { p_opponent: ben.id, p_time_control: 'none', p_color: 'b' });
  await expect(b.getByTestId('notice')).toContainText('Anna fordert dich heraus');
  await expect(b.getByTestId('badge')).toHaveText('1');

  // Ben accepts from the notice; he is White, so after his move it is Anna's turn and his badge clears.
  await b.getByTestId('notice').getByRole('button', { name: 'Ansehen' }).click();
  await expect(b).toHaveURL(new RegExp(`/partie/${gameId}`));
  await b.getByRole('button', { name: 'Annehmen' }).click();
  await expect(b.getByTestId('status')).toHaveText('Du bist am Zug');
  await b.locator('[data-square="e2"]').click();
  await b.locator('[data-square="e4"]').click();
  await expect(b.getByTestId('badge')).toHaveCount(0);

  // Anna answers while Ben looks at another page: he gets a notice and the badge comes back.
  await b.goto('/freunde');
  await b.waitForTimeout(1500);
  expect((await asAnna.functions.invoke('make-move', { body: { gameId, uci: 'e7e5' } })).error).toBeNull();
  await expect(b.getByTestId('notice')).toContainText('Anna hat gezogen');
  await expect(b.getByTestId('badge')).toHaveText('1');
});

test('designs: free designs save, Plus designs need Plus (also enforced by the database)', async ({ browser }) => {
  const anna = await makeUser('Anna');
  const asAnna = createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${anna.session!.access_token}` } } });
  const a = await signedInPage(browser, anna.session);
  await a.goto('/design');
  await a.getByRole('radio', { name: /Holz/ }).click();
  await a.getByRole('radio', { name: /Keltisch/ }).click();
  await expect(a.getByRole('status')).toHaveText('Gespeichert.');
  await a.getByRole('radio', { name: /Turnier/ }).click();
  await expect(a.getByRole('status')).toContainText('gibt es mit Plus');

  await a.goto('/spielen');
  await expect(a.getByRole('grid', { name: 'Schachbrett' })).toHaveAttribute('data-design', 'wood/celtic');
  await expect(a.locator('[data-square="e1"] img')).toHaveAttribute('src', '/pieces/celtic/wK.svg');
  expect(await a.locator('[data-square="e1"] img').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  // Going around the UI does not help without Plus …
  const denied = await asAnna.from('profiles').update({ board_theme: 'green' }).eq('id', anna.id);
  expect(denied.error?.message).toContain('design_requires_plus');
  // … but with Plus it works.
  await admin.from('entitlements').update({ plan: 'plus', source: 'stripe', active_until: null }).eq('user_id', anna.id);
  expect((await asAnna.from('profiles').update({ board_theme: 'green', piece_set: 'fantasy' }).eq('id', anna.id)).error).toBeNull();
  await a.reload();
  await expect(a.getByRole('grid', { name: 'Schachbrett' })).toHaveAttribute('data-design', 'green/fantasy');
});
