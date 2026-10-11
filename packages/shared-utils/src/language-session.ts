import type { Language } from './index';

export type LanguageApplication = 'admin' | 'shop' | 'delivery';

export type LanguageSession = {
  token: string;
  tokenKey: string;
  userKey: string;
  loginHref: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const rolesFor = (storage: StorageLike, userKey: string): string[] => {
  try {
    const user: unknown = JSON.parse(storage.getItem(userKey) ?? 'null');
    if (typeof user !== 'object' || user === null || !('roles' in user)) return [];
    const roles = (user as { roles?: unknown }).roles;
    return Array.isArray(roles) ? roles.filter((role): role is string => typeof role === 'string') : [];
  } catch {
    return [];
  }
};

export function resolveLanguageSession(storage: StorageLike, application: LanguageApplication): LanguageSession | null {
  if (application === 'admin') {
    const token = storage.getItem('farmmitra_access_token');
    return token && rolesFor(storage, 'farmmitra_user').length > 0
      ? { token, tokenKey: 'farmmitra_access_token', userKey: 'farmmitra_user', loginHref: '/' }
      : null;
  }

  if (application === 'delivery') {
    const roles = rolesFor(storage, 'farmmitra_delivery_user');
    const token = storage.getItem('farmmitra_delivery_token');
    return token && roles.some((role) => ['DELIVERY_PARTNER', 'DELIVERY_STAFF', 'SUPER_ADMIN'].includes(role))
      ? { token, tokenKey: 'farmmitra_delivery_token', userKey: 'farmmitra_delivery_user', loginHref: '/' }
      : null;
  }

  const roles = rolesFor(storage, 'farmmitra_shop_user');
  if (roles.includes('CUSTOMER')) {
    const token = storage.getItem('farmmitra_access_token');
    return token
      ? { token, tokenKey: 'farmmitra_access_token', userKey: 'farmmitra_shop_user', loginHref: '/customer/login' }
      : null;
  }
  if (roles.some((role) => ['VENDOR', 'VENDOR_ADMIN', 'VENDOR_STAFF'].includes(role))) {
    const token = storage.getItem('farmmitra_shop_token');
    return token
      ? { token, tokenKey: 'farmmitra_shop_token', userKey: 'farmmitra_shop_user', loginHref: '/login' }
      : null;
  }
  return null;
}

export function clearLanguageSession(storage: StorageLike, session: LanguageSession): void {
  storage.removeItem(session.tokenKey);
  storage.removeItem(session.userKey);
}

export function getStoredLanguage(storage: StorageLike): Language | null {
  const language: unknown = storage.getItem('farmmitra_language');
  return language === 'en' || language === 'hi' || language === 'hinglish' ? language : null;
}

export function languageAfterLogin(
  accountLanguage: unknown,
  localLanguage = typeof window === 'undefined' ? null : getStoredLanguage(localStorage),
): Language | null {
  if (localLanguage) return localLanguage;
  return accountLanguage === 'en' || accountLanguage === 'hi' || accountLanguage === 'hinglish'
    ? accountLanguage
    : null;
}

export async function syncLanguagePreference(
  token: string,
  language: Language,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:4000';
  return fetcher(`${apiUrl}/api/v1/users/me/preferred-language`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ preferredLanguage: language }),
  });
}

export type LanguageSyncResult =
  | { status: 'no-session' | 'synced' | 'failed' }
  | { status: 'expired'; loginHref: string };

export async function syncLanguageSession(
  storage: StorageLike,
  application: LanguageApplication,
  language: Language,
  fetcher: typeof fetch = fetch,
): Promise<LanguageSyncResult> {
  const session = resolveLanguageSession(storage, application);
  if (!session) return { status: 'no-session' };

  let response: Response;
  try {
    response = await syncLanguagePreference(session.token, language, fetcher);
  } catch {
    return { status: 'failed' };
  }
  if (response.status === 401) {
    clearLanguageSession(storage, session);
    return { status: 'expired', loginHref: session.loginHref };
  }
  return response.ok ? { status: 'synced' } : { status: 'failed' };
}

export function notifyLanguageSessionAuthenticated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('farmmitra:session-authenticated'));
  }
}
