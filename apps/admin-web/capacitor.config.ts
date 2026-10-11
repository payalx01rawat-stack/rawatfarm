import type { CapacitorConfig } from '@capacitor/cli';

const serverUrl = process.env.FARMMITRA_ADMIN_URL?.trim();

const config: CapacitorConfig = {
  appId: 'in.farmmitra.admin',
  appName: 'FarmMitra Admin',
  webDir: 'capacitor-shell',
  ...(serverUrl
    ? { server: { url: serverUrl, cleartext: serverUrl.startsWith('http://') } }
    : {}),
};

export default config;
