import { createClient } from '@supabase/supabase-js';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { PUBLISHABLE, URL, admin, makeUser, signedInPage } from './support';

// Screenshots for the App Store (STORE_SHOTS=1, see playwright.config.ts): real screens with demo
// players on the local Supabase stack, in the sizes App Store Connect asks for.
// Output: store/screenshots/<device>/<nn>-<scene>.png
const DEVICES = {
  // 6.9" iPhone: 1320 × 2868 pixels.
  iphone: { viewport: { width: 440, height: 956 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  // 13" iPad: 2064 × 2752 pixels.
  ipad: { viewport: { width: 1032, height: 1376 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
} as const;

type User = Awaited<ReturnType<typeof makeUser>>;
const as = (u: User) => createClient(URL, PUBLISHABLE, {
  auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${u.session!.access_token}` } },
});

async function player(name: string, rating: number) {
  const u = await makeUser(name, true);
  await admin.from('profiles').update({ random_rating: rating, random_games: 24 }).eq('id', u.id);
  return u;
}

async function befriend(a: User, b: User) {
  await admin.from('friendships').insert({ requester_id: a.id, addressee_id: b.id, status: 'accepted' });
}

async function gameBetween(white: User, black: User, plies: string[]) {
  const { data: id, error } = await as(white).rpc('create_game', { p_opponent: black.id, p_time_control: '10+0', p_color: 'w' });
  expect(error).toBeNull();
  expect((await as(black).rpc('respond_game', { p_game: id, p_action: 'accept' })).error).toBeNull();
  for (const [i, uci] of plies.entries()) {
    const { error: e } = await as(i % 2 === 0 ? white : black).functions.invoke('make-move', { body: { gameId: id, uci } });
    expect(e).toBeNull();
  }
  return id as string;
}

async function shot(page: Page, device: string, name: string, scrollTo?: string) {
  if (scrollTo) await page.locator(scrollTo).first().evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 12));
  // The app always shows links to the public site (publicOrigin()); the local preview shows localhost.
  await page.evaluate(() => {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) walk.currentNode.nodeValue = walk.currentNode.nodeValue!.replace(location.origin, 'https://knightcall.app');
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `store/screenshots/${device}/${name}.png` });
}

async function open(browser: Browser, device: keyof typeof DEVICES, user: User, path: string) {
  const page = await signedInPage(browser, user.session, { ...DEVICES[device], locale: 'de-DE', colorScheme: 'light' });
  await page.goto(path);
  return page;
}

for (const device of Object.keys(DEVICES) as Array<keyof typeof DEVICES>) {
  test(`App Store screenshots: ${device}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const lena = await player('Lena', 1342);
    const jonas = await player('Jonas', 1296);
    const friends = [jonas, await player('Mia', 1188), await player('Paul', 1415), await player('Sophie', 1251)];
    for (const f of friends) await befriend(lena, f);

    // 1. A running game with chat: Italian opening, Lena (White) to move.
    const running = await gameBetween(lena, jonas, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6', 'd2d4', 'e5d4', 'c3d4', 'c5b4', 'b1c3', 'f6e4']);
    for (const [u, body] of [[jonas, 'Na, wieder Italienisch? 😄'], [lena, 'Klar, mein Lieblingsaufbau!'], [jonas, 'Diesmal bin ich vorbereitet.']] as const) {
      await as(u).from('game_messages').insert({ game_id: running, sender_id: u.id, body });
    }
    let page = await open(browser, device, lena, `/partie/${running}`);
    await expect(page.getByTestId('status')).toContainText('Du bist am Zug');
    await expect(page.getByTestId('chat')).toContainText('vorbereitet');
    await shot(page, device, '1-partie');

    // 2. Analysis after the game: the blunder is graded and explained, with the better move as an arrow.
    const finished = await gameBetween(lena, jonas, ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7']);
    page = await open(browser, device, lena, `/partie/${finished}`);
    await page.getByRole('button', { name: 'Partie analysieren' }).click();
    await expect(page.getByTestId('keymoves')).toContainText('??', { timeout: 60_000 });
    await page.getByTestId('keymoves').getByRole('button', { name: /Sf6/ }).click();
    await expect(page.getByTestId('move-comment')).toContainText('Patzer');
    await shot(page, device, '2-analyse', '.boardcol');

    // 3. Puzzles.
    await admin.from('puzzle_stats').upsert({ user_id: lena.id, rating: 1450 });
    page = await open(browser, device, lena, '/raetsel');
    await expect(page.getByTestId('puzzle-status')).toContainText('Finde den besten Zug');
    await shot(page, device, '3-raetsel');

    // 4. Friends with their playing strength.
    page = await open(browser, device, lena, '/freunde');
    await expect(page.getByTestId('friends')).toContainText('Sophie');
    await shot(page, device, '4-freunde');
  });
}
