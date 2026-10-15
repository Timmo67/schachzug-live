import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/** True inside the iOS/Android app (Capacitor), false in the browser. */
export const isNativeApp = Capacitor.isNativePlatform();

/** Public web address; inside the app window.location is capacitor://localhost or https://localhost. */
export const PUBLIC_ORIGIN = 'https://knightcall.app';

export function publicOrigin(): string {
  return isNativeApp ? PUBLIC_ORIGIN : window.location.origin;
}

/** Link target for "open in a new tab": the app has no tabs, so links stay in the app there. */
export const newTab = isNativeApp ? {} : { target: '_blank', rel: 'noreferrer' };

/** Static files (licence texts) open on the website from inside the app. */
export function fileUrl(path: string): string {
  return isNativeApp ? `${PUBLIC_ORIGIN}${path}` : path;
}

/** Android back button: one page back, or leave the app on the start page. */
export function setupNativeApp() {
  if (!isNativeApp) return;
  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.exitApp();
  });
}
