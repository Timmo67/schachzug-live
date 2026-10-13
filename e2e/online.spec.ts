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

/**
 * Test account created through the admin API (skips the closed-beta invite check). By default it is
 * set back to the free plan so the Plus/free rules can be tested; pass beta=true to keep beta Plus.
 */
async function makeUser(name: string, beta = false) {
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

test('profile: picture upload, name change and invite QR code', async ({ browser }) => {
  const anna = await makeUser('Anna');
  const a = await signedInPage(browser, anna.session);
  await a.goto('/profil');
  // A small generated PNG as upload.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await a.getByLabel('Profilbild').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  await expect(a.getByRole('status')).toHaveText('Profilbild gespeichert.');
  const src = await a.locator('.profilehead img.avatar').getAttribute('src');
  expect(src).toContain(`/storage/v1/object/public/avatars/${anna.id}/avatar.webp`);
  expect(await a.locator('.profilehead img.avatar').evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(256);

  await a.getByLabel('Anzeigename').fill('Anna B.');
  await a.getByRole('button', { name: 'Name speichern' }).click();
  await expect(a.getByRole('status')).toHaveText('Name gespeichert.');

  // Nobody can point their avatar at someone else's file.
  const asAnna = createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${anna.session!.access_token}` } } });
  const bad = await asAnna.from('profiles').update({ avatar_url: `${URL}/storage/v1/object/public/avatars/00000000-0000-0000-0000-000000000000/avatar.webp` }).eq('id', anna.id);
  expect(bad.error).toBeTruthy();
  const foreign = await asAnna.storage.from('avatars').upload('00000000-0000-0000-0000-000000000000/x.webp', new Blob(['x'], { type: 'image/webp' }));
  expect(foreign.error).toBeTruthy();

  await a.goto('/freunde');
  await a.getByRole('button', { name: 'QR-Code zeigen' }).click();
  await expect(a.getByTestId('invite-qr').locator('svg')).toBeVisible();
});

test('closed beta: sign-up needs an invite code, 18+ and the terms; beta accounts get Plus', async ({ browser }) => {
  const host = await makeUser('Host', true);
  const { data: hostProfile } = await admin.from('profiles').select('invite_code').eq('id', host.id).single();
  const signUp = (data: Record<string, unknown>) => createClient(URL, PUBLISHABLE, { auth: { persistSession: false } }).auth.signUp({
    email: `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.test`, password: 'test-password-123', options: { data },
  });

  expect((await signUp({ adult_confirmed: true, terms_accepted: true })).error).toBeTruthy(); // no invite
  expect((await signUp({ invite_code: 'NOPE1234', adult_confirmed: true, terms_accepted: true })).error).toBeTruthy();
  expect((await signUp({ invite_code: hostProfile!.invite_code, adult_confirmed: false, terms_accepted: true })).error).toBeTruthy();

  const ok = await signUp({ invite_code: hostProfile!.invite_code, adult_confirmed: true, terms_accepted: true, display_name: 'Neu' });
  expect(ok.error).toBeNull();
  const id = ok.data.user!.id;
  const { data: p } = await admin.from('profiles').select('beta_tester, adult_confirmed_at, terms_accepted_at').eq('id', id).single();
  expect(p!.beta_tester).toBe(true);
  expect(p!.adult_confirmed_at).not.toBeNull();
  const { data: ent } = await admin.from('entitlements').select('plan, source').eq('user_id', id).single();
  expect(ent).toEqual({ plan: 'plus', source: 'beta' });

  // Users cannot flip the server-managed flags themselves.
  const asNew = createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${ok.data.session!.access_token}` } } });
  await asNew.from('profiles').update({ beta_tester: false, adult_confirmed_at: null }).eq('id', id);
  const { data: p2 } = await admin.from('profiles').select('beta_tester, adult_confirmed_at').eq('id', id).single();
  expect(p2!.beta_tester).toBe(true);
  expect(p2!.adult_confirmed_at).not.toBeNull();

  // The menu shows "Beta" and Plus designs are open.
  const page = await signedInPage(browser, ok.data.session);
  await page.goto('/design');
  await expect(page.getByTestId('plan')).toHaveText('Beta');
  await page.getByRole('radio', { name: /Turnier/ }).click();
  await expect(page.getByRole('status')).toHaveText('Gespeichert.');
});

test('login page: without a code only existing accounts, with a code the beta checkboxes appear', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/anmelden');
  await expect(page.getByLabel('Ich bin mindestens 18 Jahre alt.')).toHaveCount(0);
  await page.getByLabel('E-Mail').fill(`nobody-${Date.now()}@example.test`);
  await page.getByRole('button', { name: 'Anmelde-Link schicken' }).click();
  await expect(page.getByRole('alert')).toContainText('Einladungscode');
  await page.getByLabel('Einladungscode (nur beim ersten Mal)').fill('ABCD1234');
  await expect(page.getByLabel('Ich bin mindestens 18 Jahre alt.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anmelde-Link schicken' })).toBeDisabled();
});

/** Two befriended users with a running game (Anna White, Ben Black), via the same RPCs the app uses. */
async function runningGame() {
  const anna = await makeUser('Anna');
  const ben = await makeUser('Ben');
  await admin.from('friendships').insert({ requester_id: anna.id, addressee_id: ben.id, status: 'accepted' });
  const asUser = (s: { access_token: string } | null) =>
    createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s!.access_token}` } } });
  const { data: gameId, error } = await asUser(anna.session).rpc('create_game', { p_opponent: ben.id, p_time_control: '10+0', p_color: 'w' });
  expect(error).toBeNull();
  expect((await asUser(ben.session).rpc('respond_game', { p_game: gameId, p_action: 'accept' })).error).toBeNull();
  return { anna, ben, gameId: gameId as string };
}

test('rematch: after the game a new challenge with swapped colours is one tap away', async ({ browser }) => {
  const { anna, ben, gameId } = await runningGame();
  const a = await signedInPage(browser, anna.session);
  const b = await signedInPage(browser, ben.session);
  await a.goto(`/partie/${gameId}`);
  await a.getByRole('button', { name: 'Aufgeben' }).click();
  await a.getByRole('button', { name: 'Ja, aufgeben' }).click();
  await expect(a.getByTestId('status')).toContainText('Du verlierst');

  await a.getByRole('button', { name: 'Revanche' }).click();
  await expect(a).not.toHaveURL(new RegExp(gameId));
  await expect(a.getByTestId('status')).toContainText('Warte, bis Ben annimmt');

  await b.goto('/partien');
  await b.getByTestId('incoming').getByRole('button', { name: 'Annehmen' }).click();
  await expect(b).toHaveURL(a.url());
  // Colours are swapped: Ben is White now and moves first.
  await expect(b.getByTestId('status')).toHaveText('Du bist am Zug');
});

test('feedback: beta testers send feedback, nobody else can read it', async ({ browser }) => {
  const anna = await makeUser('Anna', true);
  const ben = await makeUser('Ben', true);
  const a = await signedInPage(browser, anna.session);
  await a.goto('/partien');
  await a.getByRole('link', { name: 'Feedback geben' }).click();
  await a.getByLabel('Deine Nachricht').fill('Das Video ruckelt auf meinem alten Handy.');
  await a.getByRole('button', { name: 'Feedback senden' }).click();
  await expect(a.getByRole('status')).toHaveText('Danke! Dein Feedback ist angekommen.');

  const { data } = await admin.from('feedback').select('user_id, body, page').eq('user_id', anna.id);
  expect(data).toEqual([{ user_id: anna.id, body: 'Das Video ruckelt auf meinem alten Handy.', page: '/partien' }]);

  const asBen = createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${ben.session!.access_token}` } } });
  expect((await asBen.from('feedback').select('id')).data).toEqual([]);
  // Nobody can send feedback in someone else's name.
  expect((await asBen.from('feedback').insert({ user_id: anna.id, body: 'Fake' })).error).toBeTruthy();
});

test('account deletion: everything personal is gone, the running game counts as resigned', async ({ browser }) => {
  const { anna, ben, gameId } = await runningGame();
  await admin.from('feedback').insert({ user_id: ben.id, body: 'Bitte löschen' });
  const b = await signedInPage(browser, ben.session);
  await b.goto('/profil');
  const del = b.getByRole('button', { name: 'Konto endgültig löschen' });
  await expect(del).toBeDisabled();
  await b.getByLabel('Zum Bestätigen LÖSCHEN eintippen').fill('löschen');
  await del.click();
  await expect(b).toHaveURL(/\/anmelden/);

  expect((await admin.auth.admin.getUserById(ben.id)).data.user).toBeNull();
  expect((await admin.from('profiles').select('id').eq('id', ben.id)).data).toEqual([]);
  expect((await admin.from('friendships').select('requester_id').or(`requester_id.eq.${ben.id},addressee_id.eq.${ben.id}`)).data).toEqual([]);
  expect((await admin.from('feedback').select('id').eq('user_id', ben.id)).data).toEqual([]);

  // Anna won the running game, and it stays in her archive.
  const a = await signedInPage(browser, anna.session);
  await a.goto(`/partie/${gameId}`);
  await expect(a.getByTestId('status')).toContainText('Du gewinnst');
  const { data: g } = await admin.from('games').select('status, result, black_id').eq('id', gameId).single();
  expect(g).toEqual({ status: 'finished', result: '1-0', black_id: null });
});

test('login with the code from the e-mail (for home-screen apps and other devices)', async ({ browser }) => {
  const anna = await makeUser('Anna', true);
  const { data: u } = await admin.auth.admin.getUserById(anna.id);
  const email = u.user!.email!;
  const page = await (await browser.newContext()).newPage();
  // No mail server in the test stack: pretend the e-mail went out, then take the code from the admin API.
  await page.route('**/auth/v1/otp*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.goto('/anmelden');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByRole('button', { name: 'Anmelde-Link schicken' }).click();
  await expect(page.getByRole('status')).toContainText('Code');

  await page.getByLabel('Code aus der E-Mail').fill('000000');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Der Code stimmt nicht oder ist abgelaufen.');

  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  expect(error).toBeNull();
  await page.getByLabel('Code aus der E-Mail').fill(link.properties!.email_otp);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page.getByRole('heading', { name: /Hallo Anna/ })).toBeVisible();
  await expect(page.getByTestId('homescreen-hint')).toBeVisible();
});

test('analysis: Stockfish finds the blunder and the better move, result is stored', async ({ browser }) => {
  test.setTimeout(120_000);
  const { anna, ben, gameId } = await runningGame();
  const asUser = (s: { access_token: string } | null) =>
    createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s!.access_token}` } } });
  // Scholar's mate: 1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6?? 4. Qxf7#
  const plies: Array<[typeof anna, string]> = [[anna, 'e2e4'], [ben, 'e7e5'], [anna, 'f1c4'], [ben, 'b8c6'], [anna, 'd1h5'], [ben, 'g8f6'], [anna, 'h5f7']];
  for (const [u, uci] of plies) {
    const { error } = await asUser(u.session).functions.invoke('make-move', { body: { gameId, uci } });
    expect(error).toBeNull();
  }

  const b = await signedInPage(browser, ben.session);
  await b.goto(`/partie/${gameId}`);
  await expect(b.getByTestId('status')).toContainText('Schachmatt');
  await b.getByRole('button', { name: 'Partie analysieren' }).click();
  await expect(b.getByTestId('keymoves')).toContainText('Nf6', { timeout: 60_000 });
  await expect(b.getByTestId('keymoves')).toContainText('??');
  await b.getByTestId('keymoves').getByRole('button', { name: /Nf6/ }).click();
  await expect(b.getByTestId('move-comment')).toContainText('Patzer');
  await expect(b.getByTestId('move-comment')).toContainText('Besser war');
  // The board shows the position before the mate: the black knight stands on f6, the queen still on h5.
  await expect(b.locator('[data-square="f6"] .pc')).toHaveCount(1);
  await expect(b.locator('[data-square="h5"] .pc')).toHaveCount(1);

  const { data } = await admin.from('game_analyses').select('evals').eq('game_id', gameId).eq('user_id', ben.id).single();
  expect((data!.evals as unknown[]).length).toBe(8);
  // Opening the game again shows the stored analysis right away.
  await b.reload();
  await expect(b.getByTestId('accuracy-b')).toContainText('%');
});

test('analysis: free players get one per day, Plus is unlimited, only own finished games', async () => {
  const anna = await makeUser('Anna');
  const ben = await makeUser('Ben', true);
  await admin.from('friendships').insert({ requester_id: anna.id, addressee_id: ben.id, status: 'accepted' });
  const as = (s: { access_token: string } | null) =>
    createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s!.access_token}` } } });
  const finishedGame = async () => {
    const { data: id } = await as(anna.session).rpc('create_game', { p_opponent: ben.id, p_time_control: 'none', p_color: 'w' });
    await as(ben.session).rpc('respond_game', { p_game: id, p_action: 'accept' });
    return id as string;
  };
  const g1 = await finishedGame();
  // Not finished yet: no analysis.
  expect((await as(anna.session).rpc('begin_analysis', { p_game: g1 })).error?.message).toContain('game_not_found');
  await as(anna.session).rpc('game_action', { p_game: g1, p_action: 'resign' });
  const g2 = await finishedGame();
  await as(anna.session).rpc('game_action', { p_game: g2, p_action: 'resign' });

  expect((await as(anna.session).rpc('analysis_status')).data).toEqual({ unlimited: false, remaining: 1 });
  expect((await as(anna.session).rpc('begin_analysis', { p_game: g1 })).error).toBeNull();
  expect((await as(anna.session).rpc('begin_analysis', { p_game: g2 })).error?.message).toContain('analysis_limit');
  // Re-opening the same game is free.
  expect((await as(anna.session).rpc('begin_analysis', { p_game: g1 })).error).toBeNull();
  // Ben (Plus) analyses both.
  expect((await as(ben.session).rpc('begin_analysis', { p_game: g1 })).error).toBeNull();
  expect((await as(ben.session).rpc('begin_analysis', { p_game: g2 })).error).toBeNull();
  // Results must match the game and can't be written directly.
  expect((await as(anna.session).rpc('save_analysis', { p_game: g1, p_evals: [{ cp: 0 }, { cp: 5 }] })).error?.message).toContain('invalid_analysis');
  expect((await as(anna.session).rpc('save_analysis', { p_game: g1, p_evals: [{ cp: 0 }] })).error).toBeNull();
  expect((await as(anna.session).from('game_analyses').insert({ game_id: g2, user_id: anna.id, evals: [] })).error).toBeTruthy();
  // Nobody sees other people's analyses.
  expect((await as(anna.session).from('game_analyses').select('user_id')).data).toEqual([{ user_id: anna.id }]);
});

/** A puzzle only this test can get: rated far above the real ones, matched to the user's puzzle rating. */
async function privatePuzzle(userId: string, fen: string, moves: string[]) {
  // Far away from the real puzzles (400–2900) and from other test runs.
  const rating = 20_000 + Math.floor(Math.random() * 1_000_000);
  const id = `e2e${Math.random().toString(36).slice(2, 10)}`;
  expect((await admin.from('puzzles').insert({ id, fen, moves, rating, themes: ['mate', 'mateIn2'] })).error).toBeNull();
  await admin.from('puzzle_stats').upsert({ user_id: userId, rating });
  return id;
}

test('puzzles: solve one (opponent answers in between), fail one and see the solution', async ({ browser }) => {
  const anna = await makeUser('Anna', true);
  // 1…Kd7 2.Be6+ Kd8 3.Qf8# – a mate in two for White.
  const solvedId = await privatePuzzle(anna.id, 'q3k1nr/1pp1nQpp/3p4/1P2p3/4P3/B1PP1b2/B5PP/5K2 b k - 0 17', ['e8d7', 'a2e6', 'd7d8', 'f7f8']);
  const a = await signedInPage(browser, anna.session);
  await a.goto('/raetsel');
  await expect(a.getByTestId('puzzle-status')).toHaveText('Finde den besten Zug für Weiß');
  await expect(a.getByTestId('puzzle-rating')).toHaveText(/^\d{5,}$/);
  await move(a, 'a2', 'e6');
  await expect(a.getByTestId('puzzle-status')).toHaveText('Finde den besten Zug für Weiß'); // after the opponent's reply
  await move(a, 'f7', 'f8');
  await expect(a.getByTestId('puzzle-status')).toHaveText('Richtig gelöst!');
  await expect(a.getByTestId('puzzle-delta')).toHaveText(/^\+\d+$/);
  await expect(a.getByTestId('puzzle-themes')).toContainText('Matt in 2');
  const { data: att } = await admin.from('puzzle_attempts').select('solved').eq('user_id', anna.id).eq('puzzle_id', solvedId).single();
  expect(att!.solved).toBe(true);

  // Next one: a wrong move counts as failed; the solution can be shown.
  const failedId = await privatePuzzle(anna.id, '6k1/1p3ppp/8/8/8/8/5PPP/R2R2K1 b - - 0 1', ['b7b6', 'd1d8']);
  await a.getByRole('button', { name: 'Nächstes Rätsel' }).click();
  await expect(a.getByTestId('puzzle-status')).toHaveText('Finde den besten Zug für Weiß');
  await move(a, 'd1', 'd7');
  await expect(a.getByTestId('puzzle-status')).toHaveText('Das war nicht der beste Zug.');
  await a.getByRole('button', { name: 'Lösung zeigen' }).click();
  await expect(a.getByTestId('puzzle-status')).toHaveText('So geht die Lösung.');
  await expect(a.locator('[data-square="d8"] .pc')).toHaveCount(1);
  const { data: att2 } = await admin.from('puzzle_attempts').select('solved').eq('user_id', anna.id).eq('puzzle_id', failedId).single();
  expect(att2!.solved).toBe(false);
});

test('puzzles: one free puzzle a day, Plus unlimited, solutions never readable, each puzzle counts once', async ({ browser }) => {
  const free = await makeUser('Free');
  const plus = await makeUser('Plus', true);
  const as = (s: { access_token: string } | null) =>
    createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s!.access_token}` } } });
  // Free: themed training is Plus only, one regular puzzle per day.
  expect((await as(free.session).rpc('next_training_puzzle', { p_themes: ['fork'] })).error?.message).toContain('training_requires_plus');
  const { data: daily, error: dailyErr } = await as(free.session).rpc('next_puzzle');
  expect(dailyErr).toBeNull();
  expect((await as(free.session).rpc('submit_puzzle', { p_puzzle: daily.id, p_solved: false })).error).toBeNull();
  expect((await as(free.session).rpc('next_puzzle')).error?.message).toContain('puzzle_requires_plus');
  const page = await signedInPage(browser, free.session);
  await page.goto('/raetsel');
  await expect(page.getByTestId('puzzle-status')).toHaveText('Dein Gratis-Rätsel für heute ist erledigt.');

  expect((await as(plus.session).from('puzzles').select('id').limit(1)).data).toEqual([]);
  const { data: p, error } = await as(plus.session).rpc('next_puzzle');
  expect(error).toBeNull();
  // Reloading hands out the same open puzzle instead of a new one.
  expect((await as(plus.session).rpc('next_puzzle')).data.id).toBe(p.id);
  expect((await as(plus.session).rpc('submit_puzzle', { p_puzzle: p.id, p_solved: true })).error).toBeNull();
  expect((await as(plus.session).rpc('submit_puzzle', { p_puzzle: p.id, p_solved: true })).error?.message).toContain('puzzle_not_open');
  expect((await as(plus.session).rpc('submit_puzzle', { p_puzzle: 'never-handed-out', p_solved: true })).error?.message).toContain('puzzle_not_open');
  const { data: s } = await as(plus.session).rpc('puzzle_status');
  expect(s).toMatchObject({ solved: 1, failed: 0, streak: 1, plus: true });
});

/**
 * A finished game where the player (Black) leaves a pawn hanging at move 9: 22 plies, evaluations made up so
 * the mistake is clear (the opponent's best reply captures).
 */
const TRAINING_MOVES = [
  'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8',
  'e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a5',
];
const TRAINING_EVALS = TRAINING_MOVES.map(() => ({ cp: 0 })).concat([{ cp: 0 }]) as Array<{ cp: number; best?: string }>;
TRAINING_EVALS[17] = { cp: 0, best: 'e7e5' };
TRAINING_EVALS[18] = { cp: 300, best: 'e4d5' };

test('training: unlocks after 10 games, analyses missing games and suggests lessons for typical mistakes', async ({ browser }) => {
  test.setTimeout(180_000);
  const anna = await makeUser('Anna', true);
  const ben = await makeUser('Ben', true);
  const addGames = async (n: number, analysed: boolean) => {
    for (let i = 0; i < n; i++) {
      const { data: g, error } = await admin.from('games').insert({
        white_id: ben.id, black_id: anna.id, created_by: ben.id, status: 'finished', moves_uci: TRAINING_MOVES,
        result: '1-0', termination: 'resign', finished_at: new Date().toISOString(),
      }).select('id').single();
      expect(error).toBeNull();
      if (analysed) await admin.from('game_analyses').insert({ game_id: g!.id, user_id: anna.id, evals: TRAINING_EVALS });
    }
  };
  await addGames(9, true);

  const a = await signedInPage(browser, anna.session);
  await a.goto('/');
  await expect(a.getByTestId('training-hint')).toContainText('startet nach 10 Partien – noch 1');
  await a.getByRole('link', { name: 'Training' }).first().click();
  await expect(a.getByTestId('training-progress')).toContainText('9 von 10 Partien – noch eine Partie');

  // The 10th game has no analysis yet: the training page runs the engine on it first.
  await addGames(1, false);
  await a.reload();
  await expect(a.getByTestId('lessons')).toBeVisible({ timeout: 120_000 });
  await expect(a.getByTestId('lessons').locator('h3').first()).toHaveText('1. Ungedeckte Figuren');
  await expect(a.getByTestId('lessons')).toContainText(/In deinen letzten 10 Partien hast du (9|10) Mal/);
  expect((await admin.from('game_analyses').select('game_id', { count: 'exact', head: true }).eq('user_id', anna.id)).count).toBe(10);

  // Practising a lesson hands out puzzles with that motif.
  await a.getByRole('link', { name: 'Üben' }).first().click();
  await expect(a.getByTestId('lesson-title')).toContainText('Ungedeckte Figuren');
  await expect(a.getByTestId('puzzle-status')).toContainText('Finde den besten Zug');
  const { data: open } = await admin.from('puzzle_attempts').select('puzzle_id').eq('user_id', anna.id).is('solved', null).single();
  const { data: pz } = await admin.from('puzzles').select('themes').eq('id', open!.puzzle_id).single();
  expect(pz!.themes.some((t: string) => ['hangingPiece', 'trappedPiece'].includes(t))).toBe(true);
});

const asUser = (s: { access_token: string } | null) =>
  createClient(URL, PUBLISHABLE, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${s!.access_token}` } } });

/** Pairs two users through the matchmaking RPC (as the search page does) and returns the game id. */
async function matchViaQueue(a: { session: { access_token: string } | null }, b: { session: { access_token: string } | null }) {
  expect((await asUser(a.session).rpc('find_match', { p_time_control: '5+0' })).data.waiting).toBe(true);
  const { data } = await asUser(b.session).rpc('find_match', { p_time_control: '5+0' });
  expect(data.game_id).toBeTruthy();
  expect((await asUser(a.session).rpc('find_match', { p_time_control: '5+0' })).data.game_id).toBe(data.game_id);
  return data.game_id as string;
}

test('random opponents: matched from the search page, no video and fixed phrases between strangers, rating, friend request', async ({ browser }) => {
  test.setTimeout(120_000);
  const anna = await makeUser('Anna', true);
  const ben = await makeUser('Ben', true);
  const a = await signedInPage(browser, anna.session);
  const b = await signedInPage(browser, ben.session);
  for (const p of [a, b]) {
    await p.goto('/zufall');
    await expect(p.getByTestId('random-rating')).toHaveText('1200');
    await p.getByRole('radio', { name: '3 + 2' }).click();
    await p.getByRole('button', { name: 'Gegner suchen' }).click();
  }
  await expect(a).toHaveURL(/\/partie\//, { timeout: 20_000 });
  await expect(b).toHaveURL(a.url(), { timeout: 20_000 });
  const gameId = a.url().split('/partie/')[1];
  const { data: g } = await admin.from('games').select('kind, status, time_control, white_id').eq('id', gameId).single();
  expect(g).toMatchObject({ kind: 'random', status: 'active', time_control: '3+2' });

  // Strangers: no video (not even free minutes), only fixed chat phrases – also enforced by the server.
  await expect(a.getByTestId('first-move')).toBeVisible();
  await expect(a.getByText('Videochat mit')).toHaveCount(0);
  expect((await asUser(anna.session).rpc('video_status', { p_game: gameId })).data.allowed).toBe(false);
  await a.getByTestId('phrases').getByRole('button', { name: 'Viel Glück!' }).click();
  await expect(b.getByTestId('chat')).toContainText('Viel Glück!');
  const free = await asUser(ben.session).from('game_messages').insert({ game_id: gameId, sender_id: ben.id, body: 'meine Nummer ist …' });
  expect(free.error?.message).toContain('chat_phrases_only');

  // Ben resigns: Elo moves both ratings by 20 (first games count double).
  const white = g!.white_id === anna.id ? a : b;
  await white.getByRole('button', { name: 'Aufgeben' }).click();
  await white.getByRole('button', { name: 'Ja, aufgeben' }).click();
  const loser = g!.white_id;
  const winner = loser === anna.id ? ben.id : anna.id;
  await expect.poll(async () => (await admin.from('profiles').select('random_rating').eq('id', winner).single()).data!.random_rating).toBe(1220);
  expect((await admin.from('profiles').select('random_rating, random_games').eq('id', loser).single()).data).toEqual({ random_rating: 1180, random_games: 1 });

  // After the game: friend request; once accepted, the free chat and video come back.
  await b.reload();
  await b.getByTestId('stranger-actions').getByRole('button', { name: 'Als Freund anfragen' }).click();
  await expect(b.getByTestId('game-info')).toHaveText('Freundschaftsanfrage gesendet.');
  expect((await asUser(anna.session).rpc('respond_friend', { p_other: ben.id, p_action: 'accept' })).error).toBeNull();
  await a.reload();
  await expect(a.getByLabel('Nachricht')).toBeVisible();
  await expect(a.getByTestId('phrases')).toHaveCount(0);
});

test('random opponents: a side that never moves gets the game called off without rating', async () => {
  const anna = await makeUser('Anna');
  const ben = await makeUser('Ben');
  const gameId = await matchViaQueue(anna, ben);
  expect((await asUser(anna.session).rpc('abort_random_game', { p_game: gameId })).error?.message).toContain('too_early');
  await admin.from('games').update({ created_at: new Date(Date.now() - 31_000).toISOString() }).eq('id', gameId);
  expect((await asUser(anna.session).rpc('abort_random_game', { p_game: gameId })).error).toBeNull();
  const { data } = await admin.from('games').select('status, termination').eq('id', gameId).single();
  expect(data).toEqual({ status: 'aborted', termination: 'no_first_move' });
  expect((await admin.from('profiles').select('random_games').eq('id', anna.id).single()).data!.random_games).toBe(0);
});

test('blocking: never matched again, no rematch, no friend requests; can be lifted in the profile', async ({ browser }) => {
  const anna = await makeUser('Anna');
  const ben = await makeUser('Ben');
  const gameId = await matchViaQueue(anna, ben);
  await asUser(anna.session).rpc('game_action', { p_game: gameId, p_action: 'resign' });
  // Anna can't make the first move-less game finish by resigning – end it as the server would.
  await admin.from('games').update({ status: 'finished', result: '0-1', termination: 'resign' }).eq('id', gameId);

  const a = await signedInPage(browser, anna.session);
  await a.goto(`/partie/${gameId}`);
  await a.getByRole('button', { name: 'Blockieren' }).click();
  await a.getByRole('button', { name: 'Ja, blockieren' }).click();
  await expect(a.getByTestId('game-info')).toContainText('Blockiert');

  expect((await asUser(ben.session).rpc('find_match', { p_time_control: '5+0' })).data.waiting).toBe(true);
  expect((await asUser(anna.session).rpc('find_match', { p_time_control: '5+0' })).data.waiting).toBe(true);
  expect((await asUser(ben.session).rpc('find_match', { p_time_control: '5+0' })).data.waiting).toBe(true);
  await asUser(anna.session).rpc('cancel_match');
  await asUser(ben.session).rpc('cancel_match');
  expect((await asUser(ben.session).rpc('rematch_random', { p_game: gameId })).error?.message).toContain('not_possible');
  const { data: annaProfile } = await admin.from('profiles').select('invite_code').eq('id', anna.id).single();
  await asUser(ben.session).rpc('request_friend', { p_code: annaProfile!.invite_code });
  const { data: rows } = await admin.from('friendships').select('status').or(`requester_id.eq.${ben.id},addressee_id.eq.${ben.id}`);
  expect(rows).toEqual([{ status: 'blocked' }]);

  await a.goto('/profil');
  await expect(a.getByTestId('blocked')).toContainText('Ben');
  await a.getByTestId('blocked').getByRole('button', { name: 'Aufheben' }).click();
  await expect(a.getByText('Du hast niemanden blockiert.')).toBeVisible();
});

test('reports: three reporters exclude a player from random games; an admin releases them', async ({ browser }) => {
  const trollName = `Troll${Math.random().toString(36).slice(2, 7)}`;
  const target = await makeUser(trollName);
  const reporters = [await makeUser('R1'), await makeUser('R2'), await makeUser('R3')];
  const games: string[] = [];
  for (const r of reporters) {
    const { data: g } = await admin.from('games').insert({ white_id: r.id, black_id: target.id, created_by: r.id, status: 'finished',
      kind: 'random', result: '1-0', termination: 'resign', moves_uci: [] }).select('id').single();
    games.push(g!.id);
  }
  // Report through the page for the first reporter.
  const r1 = await signedInPage(browser, reporters[0].session);
  await r1.goto(`/partie/${games[0]}`);
  await r1.getByRole('button', { name: 'Melden' }).click();
  await r1.getByLabel('Beleidigender oder unpassender Name').check();
  await r1.getByLabel('Was ist passiert? (freiwillig)').fill('Name ist beleidigend');
  await r1.getByRole('button', { name: 'Meldung senden' }).click();
  await expect(r1.getByTestId('game-info')).toContainText('Danke, deine Meldung ist angekommen');
  expect((await asUser(reporters[0].session).rpc('report_user', { p_user: target.id, p_game: games[0], p_reason: 'other', p_details: '' })).error?.message).toContain('already_reported');
  // Only opponents can report; nobody writes reports directly.
  expect((await asUser(reporters[1].session).rpc('report_user', { p_user: target.id, p_game: games[0], p_reason: 'other', p_details: '' })).error?.message).toContain('invalid_report');
  expect((await asUser(reporters[1].session).from('reports').insert({ reporter_id: reporters[1].id, reported_id: target.id, reason: 'x' })).error).toBeTruthy();
  expect((await admin.from('profiles').select('random_banned').eq('id', target.id).single()).data!.random_banned).toBe(false);

  for (const i of [1, 2]) {
    expect((await asUser(reporters[i].session).rpc('report_user', { p_user: target.id, p_game: games[i], p_reason: 'behaviour', p_details: '' })).error).toBeNull();
  }
  expect((await admin.from('profiles').select('random_banned').eq('id', target.id).single()).data!.random_banned).toBe(true);
  expect((await asUser(target.session).rpc('find_match', { p_time_control: '5+0' })).error?.message).toContain('random_banned');
  const t = await signedInPage(browser, target.session);
  await t.goto('/zufall');
  await expect(t.getByTestId('random-state')).toContainText('vorläufig von Zufallspartien ausgeschlossen');
  // Nobody can make themselves admin or lift their own exclusion.
  await asUser(target.session).from('profiles').update({ is_admin: true, random_banned: false }).eq('id', target.id);
  expect((await admin.from('profiles').select('is_admin, random_banned').eq('id', target.id).single()).data).toEqual({ is_admin: false, random_banned: true });
  expect((await asUser(target.session).rpc('admin_reports')).error?.message).toContain('not_admin');

  // The admin sees the reports and releases the player.
  const mod = await makeUser('Mod');
  await admin.from('profiles').update({ is_admin: true }).eq('id', mod.id);
  const m = await signedInPage(browser, mod.session);
  await m.goto('/moderation');
  const card = m.getByTestId('report-card').filter({ hasText: trollName });
  await expect(card).toContainText('3 offene Meldungen');
  await expect(card).toContainText('Name ist beleidigend');
  await card.getByRole('button', { name: 'Unbegründet – freigeben' }).click();
  await expect.poll(async () => (await admin.from('profiles').select('random_banned').eq('id', target.id).single()).data!.random_banned).toBe(false);
});
