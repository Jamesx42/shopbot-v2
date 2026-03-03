// src/config.js
export function getConfig() {
  const adminIds = (process.env.ADMIN_IDS || '')
    .split(',')
    .map(id => Number(id.trim()))
    .filter(Boolean);

  return {
    BOT_TOKEN:              process.env.BOT_TOKEN,
    MONGODB_URI:            process.env.MONGODB_URI,
    NOWPAYMENTS_API_KEY:    process.env.NOWPAYMENTS_API_KEY,
    NOWPAYMENTS_IPN_SECRET: process.env.NOWPAYMENTS_IPN_SECRET,
    NOWPAYMENTS_API_URL:    'https://api.nowpayments.io/v1',
    WEBHOOK_URL:            process.env.WEBHOOK_URL || '',
    ADMIN_IDS:              adminIds,
    MIN_DEPOSIT_USD:        1,
    MAX_DEPOSIT_USD:        1000,
    PAYMENT_EXPIRY_MIN:     60,
    SUPPORTED_CRYPTOS: [
      { ticker: 'btc',       name: 'Bitcoin',    emoji: '₿'  },
      { ticker: 'eth',       name: 'Ethereum',   emoji: 'Ξ'  },
      { ticker: 'usdttrc20', name: 'USDT TRC20', emoji: '💵' },
      { ticker: 'ltc',       name: 'Litecoin',   emoji: 'Ł'  },
    ],
  };
}