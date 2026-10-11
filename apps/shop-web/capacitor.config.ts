import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.FARMMITRA_SHOP_URL?.trim();

const config: CapacitorConfig = {
  appId: 'in.farmmitra.shop',
  appName: 'FarmMitra Shop',
  webDir: 'capacitor-shell',
  ...(serverUrl
    ? { server: { url: serverUrl, cleartext: serverUrl.startsWith('http://') } }
    : {}),
};

export default config;
