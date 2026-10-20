import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.loriens22.maverickbot',
  appName: 'Maverick Bot',
  webDir: 'dist',
  backgroundColor: '#05060a',
  android: {
    allowMixedContent: false,
    backgroundColor: '#05060a',
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#05060a',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#05060a',
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
