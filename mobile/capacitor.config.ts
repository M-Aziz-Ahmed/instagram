import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.anontweet.mobile',
  appName: 'AnonTweet',
  webDir: 'www',
  // Load the deployed site instead of bundling the full Next.js build, so the
  // mobile app and the web app always share the same frontend/code.
  server: {
    url: 'https://anontweet.vercel.app',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;