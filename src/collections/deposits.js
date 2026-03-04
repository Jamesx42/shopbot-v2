// src/collections/deposits.js
import { getDB } from '../db/client.js';
import { ObjectId } from 'mongodb';

const col = () => getDB().collection('deposits');

export async function createDeposit({ telegramId, payCurrency, priceUsdt, expiresAt }) {
  const result = await col().insertOne({
    telegramId,
    payCurrency,
    priceUsdt,    // cents — what user requested in USDT
    actualUsdt: null,
    nowPaymentId: null,
    payAddress: null,
    payAmount: null,
    status: 'waiting',
    expiresAt,
    createdAt: new Date(),
  });
  return result.insertedId;
}

export async function updateDepositPayment(id, { nowPaymentId, payAddress, payAmount }) {
  return col().updateOne(
    { _id: new ObjectId(id) },
    { $set: { nowPaymentId, payAddress, payAmount } }
  );
}

export async function updateDepositStatus(nowPaymentId, status, actualUsdt = null) {
  const $set = { status };
  if (actualUsdt !== null) $set.actualUsdt = actualUsdt;
  if (status === 'finished') $set.completedAt = new Date();
  return col().updateOne({ nowPaymentId: String(nowPaymentId) }, { $set });
}

export async function getDepositByNowPaymentId(nowPaymentId) {
  return col().findOne({ nowPaymentId: String(nowPaymentId) });
}

export async function getDepositById(id) {
  try {
    return col().findOne({ _id: new ObjectId(id) });
  } catch {
    return null;
  }
}