// src/collections/recharges.js
import { getDB }    from '../db/client.js';
import { ObjectId } from 'mongodb';

const col = () => getDB().collection('recharges');

export async function createRecharge({ telegramId, orderId, amount, productName, licenseKey }) {
  const result = await col().insertOne({
    telegramId,
    orderId:     new ObjectId(orderId),
    productName,
    licenseKey,  // the account credentials for admin reference
    amount,      // cents — already deducted from user balance
    status:      'pending',
    createdAt:   new Date(),
    completedAt: null,
  });
  return result.insertedId;
}

export async function getPendingRecharges() {
  return col().find({ status: 'pending' }).sort({ createdAt: 1 }).toArray();
}

export async function getRechargeById(id) {
  try {
    return col().findOne({ _id: new ObjectId(id) });
  } catch {
    return null;
  }
}

export async function completeRecharge(id) {
  return col().findOneAndUpdate(
    { _id: new ObjectId(id), status: 'pending' },
    { $set: { status: 'completed', completedAt: new Date() } },
    { returnDocument: 'after' }
  );
}

export async function getRechargeCount() {
  return col().countDocuments();
}