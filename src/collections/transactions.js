// src/collections/transactions.js
import { getDB } from '../db/client.js';
import { ObjectId } from 'mongodb';

const col = () => getDB().collection('transactions');

export async function logTransaction({ telegramId, type, amount, balanceBefore, balanceAfter, description, refId }, session = null) {
  const opts = session ? { session } : {};
  return col().insertOne(
    {
      telegramId,
      type,          // 'deposit' | 'purchase' | 'recharge'
      amount,        // positive = credit, negative = debit
      balanceBefore,
      balanceAfter,
      description,
      refId: refId ? new ObjectId(refId) : null,
      createdAt: new Date(),
    },
    opts
  );
}

export async function getTransactionsByUser(telegramId) {
  return col().find({ telegramId }).sort({ createdAt: -1 }).limit(10).toArray();
}

export async function getTransactionsByUserPaginated(telegramId, skip = 0, limit = 10) {
  const txns = await col()
    .find({ telegramId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  const total = await col().countDocuments({ telegramId });
  return { txns, total };
}