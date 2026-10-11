import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearLanguageSession,
  getStoredLanguage,
  languageAfterLogin,
  resolveLanguageSession,
  syncLanguageSession,
  syncLanguagePreference,
} from './language-session.js';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

test('resolves only the token belonging to the active app account', () => {
  const storage = new MemoryStorage();
  storage.setItem('farmmitra_access_token', 'expired-customer-token');
  storage.setItem('farmmitra_shop_token', 'active-vendor-token');
  storage.setItem('farmmitra_shop_user', JSON.stringify({ roles: ['VENDOR'] }));
  storage.setItem('farmmitra_delivery_token', 'active-delivery-token');
  storage.setItem('farmmitra_delivery_user', JSON.stringify({ roles: ['DELIVERY_PARTNER'] }));

  assert.equal(resolveLanguageSession(storage, 'shop')?.token, 'active-vendor-token');
  assert.equal(resolveLanguageSession(storage, 'delivery')?.token, 'active-delivery-token');

  storage.setItem('farmmitra_shop_user', JSON.stringify({ roles: ['CUSTOMER'] }));
  storage.removeItem('farmmitra_access_token');
  assert.equal(resolveLanguageSession(storage, 'shop'), null);
  storage.setItem('farmmitra_access_token', 'active-customer-token');
  assert.equal(resolveLanguageSession(storage, 'shop')?.token, 'active-customer-token');
});

test('clears only the expired app session and retains the local language', () => {
  const storage = new MemoryStorage();
  storage.setItem('farmmitra_language', 'hi');
  storage.setItem('farmmitra_access_token', 'admin-token');
  storage.setItem('farmmitra_user', JSON.stringify({ roles: ['ADMIN'] }));
  storage.setItem('farmmitra_delivery_token', 'delivery-token');

  const session = resolveLanguageSession(storage, 'admin');
  assert.ok(session);
  clearLanguageSession(storage, session);
  assert.equal(storage.getItem('farmmitra_access_token'), null);
  assert.equal(storage.getItem('farmmitra_user'), null);
  assert.equal(storage.getItem('farmmitra_delivery_token'), 'delivery-token');
  assert.equal(getStoredLanguage(storage), 'hi');
});

test('preserves a local language through sign-in and accepts all supported locales', () => {
  for (const language of ['en', 'hi', 'hinglish'] as const) {
    const storage = new MemoryStorage();
    storage.setItem('farmmitra_language', language);
    assert.equal(getStoredLanguage(storage), language);
    assert.equal(languageAfterLogin('en', language), language);
  }
  assert.equal(languageAfterLogin('en'), 'en');
});

test('sends language preferences using authenticated PATCH requests for all locales', async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response('{}', { status: 200 });
  };

  for (const language of ['en', 'hi', 'hinglish'] as const) {
    const response = await syncLanguagePreference('valid-session-token', language, fetcher);
    assert.equal(response.status, 200);
  }
  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.match(request.url, /\/api\/v1\/users\/me\/preferred-language$/);
    assert.equal(request.init?.method, 'PATCH');
    assert.equal(new Headers(request.init?.headers).get('authorization'), 'Bearer valid-session-token');
    assert.ok(['en', 'hi', 'hinglish'].includes(JSON.parse(String(request.init?.body)).preferredLanguage));
  }
});

test('syncs with a valid app token and explicitly preserves local language on expiry', async () => {
  const storage = new MemoryStorage();
  storage.setItem('farmmitra_language', 'hinglish');
  storage.setItem('farmmitra_access_token', 'current-admin-token');
  storage.setItem('farmmitra_user', JSON.stringify({ roles: ['ADMIN'] }));
  let requestCount = 0;
  const okFetcher: typeof fetch = async (_input, init) => {
    requestCount += 1;
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer current-admin-token');
    return new Response('{}', { status: 200 });
  };
  assert.deepEqual(await syncLanguageSession(storage, 'admin', 'hinglish', okFetcher), { status: 'synced' });
  assert.equal(requestCount, 1);

  const expiredFetcher: typeof fetch = async () => {
    requestCount += 1;
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), { status: 401 });
  };
  assert.deepEqual(await syncLanguageSession(storage, 'admin', 'hi', expiredFetcher), { status: 'expired', loginHref: '/' });
  assert.equal(requestCount, 2);
  assert.equal(storage.getItem('farmmitra_access_token'), null);
  assert.equal(storage.getItem('farmmitra_user'), null);
  assert.equal(getStoredLanguage(storage), 'hinglish');
  assert.deepEqual(await syncLanguageSession(storage, 'admin', 'hi', expiredFetcher), { status: 'no-session' });
  assert.equal(requestCount, 2);
});
