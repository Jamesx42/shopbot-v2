// src/services/nowpayments.js
import { getConfig } from '../config.js';

function getHeaders() {
  return {
    'x-api-key': getConfig().NOWPAYMENTS_API_KEY,
    'Content-Type': 'application/json',
  };
}

export async function createPayment({ amountUsdt, payCurrency, depositId }) {
  const { NOWPAYMENTS_API_URL, WEBHOOK_URL } = getConfig();

  const res = await fetch(`${NOWPAYMENTS_API_URL}/payment`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      price_amount: amountUsdt / 100,  // cents → USDT units
      price_currency: 'usdttrc20',       // always price in USDT
      pay_currency: payCurrency,       // what user pays with
      order_id: depositId,
      order_description: 'Balance top-up',
      ipn_callback_url: `${WEBHOOK_URL}/webhook/nowpayments`,
      is_fee_paid_by_user: true,            // user pays network fee on top
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`NOWPayments error: ${err}`);
  }

  return res.json();
}

export async function getBalance() {
  const { NOWPAYMENTS_API_URL } = getConfig();
  const res = await fetch(`${NOWPAYMENTS_API_URL}/balance`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`NowPayments balance error (${res.status}): ${err}`);
  }
  return res.json();
}

export async function getPaymentStatus(paymentId) {
  const { NOWPAYMENTS_API_URL } = getConfig();
  const res = await fetch(`${NOWPAYMENTS_API_URL}/payment/${paymentId}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch payment status');
  return res.json();
}

export async function verifyWebhookSignature(payload, receivedSig) {
  const { NOWPAYMENTS_IPN_SECRET } = getConfig();
  const encoder = new TextEncoder();
  const sorted = JSON.stringify(sortDeep(payload));

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(NOWPAYMENTS_IPN_SECRET),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(sorted));
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return expected === receivedSig;
}

function sortDeep(obj) {
  if (Array.isArray(obj)) return obj.map(sortDeep);
  if (obj && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((acc, k) => {
      acc[k] = sortDeep(obj[k]);
      return acc;
    }, {});
  }
  return obj;
}