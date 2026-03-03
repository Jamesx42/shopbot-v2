// src/services/balance.js
import { creditUserBalance, debitUserBalance } from '../collections/users.js';
import { logTransaction }                       from '../collections/transactions.js';

export async function credit(telegramId, amountCents, description, refId = null, session = null) {
  const user = await creditUserBalance(telegramId, amountCents, session);
  await logTransaction({
    telegramId,
    type:          'deposit',
    amount:        amountCents,
    balanceBefore: user.balance - amountCents,
    balanceAfter:  user.balance,
    description,
    refId,
  }, session);
  return user;
}

export async function debit(telegramId, amountCents, description, refId = null, session = null) {
  const user = await debitUserBalance(telegramId, amountCents, session);
  await logTransaction({
    telegramId,
    type:          'purchase',
    amount:        -amountCents,
    balanceBefore: user.balance + amountCents,
    balanceAfter:  user.balance,
    description,
    refId,
  }, session);
  return user;
}