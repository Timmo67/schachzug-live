import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { isNativeApp } from '../../lib/native';
import { supabase } from '../../lib/supabase';

// Push notifications in the iOS/Android app. The server decides what to send (database triggers +
// Edge Function send-push); the app only registers this device for the signed-in user and opens the
// game a notification points to. While the app is open, the in-app notifications are used instead.

const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
/** Android needs the Firebase config file in the build (CI sets VITE_PUSH_ANDROID); without it registering would crash. */
export const pushAvailable = isNativeApp && (platform === 'ios' || import.meta.env.VITE_PUSH_ANDROID === '1');

let deviceToken: string | null = null;

/** Called before signing out, so this device stops getting the user's notifications. */
export async function forgetPushToken() {
  if (!deviceToken || !supabase) return;
  await supabase.rpc('unregister_push_token', { p_token: deviceToken });
  deviceToken = null;
}

export function usePushNotifications(userId: string | undefined, open: (url: string) => void) {
  // Tapping a notification opens its page (also when the tap started the app).
  useEffect(() => {
    if (!pushAvailable) return;
    const sub = PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const url = (a.notification.data as { url?: unknown } | undefined)?.url;
      if (typeof url === 'string' && url.startsWith('/')) open(url);
    });
    return () => { void sub.then((s) => s.remove()); };
  }, [open]);

  // Ask once for permission after signing in and register this device for the user.
  useEffect(() => {
    if (!pushAvailable || !userId || !supabase) return;
    const client = supabase;
    let alive = true;
    const reg = PushNotifications.addListener('registration', ({ value }) => {
      deviceToken = value;
      void client.rpc('register_push_token', { p_token: value, p_platform: platform });
    });
    const err = PushNotifications.addListener('registrationError', (e) => console.warn('push registration failed', e.error));
    void (async () => {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
      if (alive && perm.receive === 'granted') await PushNotifications.register();
    })();
    return () => {
      alive = false;
      void reg.then((s) => s.remove());
      void err.then((s) => s.remove());
    };
  }, [userId]);
}

/** Permission state for the profile page ('unsupported' outside the app). */
export function usePushPermission() {
  const [state, setState] = useState<'granted' | 'denied' | 'prompt' | 'unsupported'>('unsupported');
  useEffect(() => {
    if (!pushAvailable) return;
    void PushNotifications.checkPermissions().then((p) => setState(p.receive === 'granted' ? 'granted' : p.receive === 'denied' ? 'denied' : 'prompt'));
  }, []);
  return state;
}
