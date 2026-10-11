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
