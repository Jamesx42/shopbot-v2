// src/collections/users.js
import { getDB } from '../db/client.js';

const col = () => getDB().collection('users');

export async function findOrCreateUser(from) {
  const { id: telegramId, first_name, username } = from;
  const now = new Date();

  await col().updateOne(
    { telegramId },
    {
      $setOnInsert: {
        telegramId,
        balance:        0,
        totalDeposited: 0,
        totalSpent:     0,
        isBanned:       false,
        createdAt:      now,
      },
      $set: {
        firstName: first_name || '',
        username:  username   || null,
        updatedAt: now,
      },
    },
    { upsert: true }
  );

  return col().findOne({ telegramId });
}

export async function getUserByTelegramId(telegramId) {
  return col().findOne({ telegramId });
}

export async function creditUserBalance(telegramId, amountCents, session = null) {
  const opts = session ? { session } : {};
  return col().findOneAndUpdate(
    { telegramId },
    {
      $inc: { balance: amountCents, totalDeposited: amountCents },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after', ...opts }
  );
}

export async function debitUserBalance(telegramId, amountCents, session = null) {
  const opts = session ? { session } : {};
  const result = await col().findOneAndUpdate(
    { telegramId, balance: { $gte: amountCents } },
    {
      $inc: { balance: -amountCents, totalSpent: amountCents },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after', ...opts }
  );
  if (!result) throw new Error('INSUFFICIENT_BALANCE');
  return result;
}

export async function getUserCount() {
  return col().countDocuments();
}

export async function getAllUsers() {
  return col().find({}).sort({ createdAt: -1 }).toArray();
}

export async function banUser(telegramId, isBanned) {
  return col().updateOne({ telegramId }, { $set: { isBanned } });
}