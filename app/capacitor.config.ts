import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.loriens22.maverickbot',
  appName: 'Maverick Bot',
  webDir: 'dist',
  backgroundColor: '#000000',
  android: {
    allowMixedContent: false,
    backgroundColor: '#000000',
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#000000',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#000000',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true,
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DARK',
    },
  },
};

export default config;
