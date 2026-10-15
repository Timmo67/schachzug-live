import type { CapacitorConfig } from '@capacitor/cli';

// iOS and Android apps: the same web app (dist/) inside a native WebView.
const config: CapacitorConfig = {
  appId: 'app.knightcall',
  appName: 'Knightcall',
  webDir: 'dist',
  backgroundColor: '#eceff2',
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false },
  plugins: {
    // While the app is open the in-app notifications show events; pushes only appear in the background.
    PushNotifications: { presentationOptions: [] },
  },
};

export default config;
