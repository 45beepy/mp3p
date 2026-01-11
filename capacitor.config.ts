import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yourname.mp3p',
  appName: 'MP3P',
  webDir: 'dist',
  bundledWebRuntime: false,
  android: {
    allowMixedContent: true,
    backgroundColor: '#000000'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#000000',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    }
  }
};

export default config;
