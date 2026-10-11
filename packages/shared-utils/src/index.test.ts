import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLocalizedCurrency, formatLocalizedDate, isLanguage, translate, translateText } from './index.js';

test('supports English, Hindi and Hinglish with English fallback', () => {
  assert.equal(translate('outstandingBalance', 'en'), 'Outstanding Balance');
  assert.equal(translate('outstandingBalance', 'hi'), 'बकाया राशि');
  assert.equal(translate('outstandingBalance', 'hinglish'), 'Baaki Amount');
  assert.equal(translate('unknownKey', 'hi'), 'unknownKey');
  assert.equal(translateText('Good food, raised with care.', 'hi'), 'प्यार से उगाया गया अच्छा खाना।');
  assert.equal(translate('staffCashHandovers', 'hinglish'), 'Staff cash handovers');
});

test('interpolates values and formats INR/dates using the selected locale and India timezone', () => {
  assert.equal(translate('pageOf', 'hi', { page: 2, pages: 5 }), 'पृष्ठ 2 / 5');
  assert.equal(formatLocalizedCurrency(1200, 'en'), '₹1,200');
  assert.equal(formatLocalizedDate('2026-10-08T19:00:00.000Z', 'en', { dateStyle: 'short' }), '09/10/26');
  assert.equal(isLanguage('hinglish'), true);
  assert.equal(isLanguage('unknown'), false);
});
