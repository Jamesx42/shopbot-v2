// src/collections/sessions.js
// Replaces in-memory Map() sessions — persists across bot restarts
import { getDB } from '../db/client.js';

const col = () => getDB().collection('sessions');

export async function setSession(telegramId, data) {
  return col().updateOne(
    { telegramId },
    {
      $set: {
        telegramId,
        data,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
}

export async function getSession(telegramId) {
  const doc = await col().findOne({ telegramId });
  return doc?.data || null;
}

export async function clearSession(telegramId) {
  return col().deleteOne({ telegramId });
}