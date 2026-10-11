import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.FARMMITRA_DELIVERY_URL?.trim();

const config: CapacitorConfig = {
  appId: 'in.farmmitra.delivery',
  appName: 'FarmMitra Delivery',
  webDir: 'capacitor-shell',
  ...(serverUrl
    ? { server: { url: serverUrl, cleartext: serverUrl.startsWith('http://') } }
    : {}),
};

export default config;
