const dotenv = require('dotenv');

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const config = {
  port: Number(process.env.PORT || 3000),
  apiKey: required('API_KEY'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  telegramApiId: Number(required('TELEGRAM_API_ID')),
  telegramApiHash: required('TELEGRAM_API_HASH'),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 100),
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 15_000),
  maxLogEntries: Number(process.env.MAX_LOG_ENTRIES || 1000)
};

module.exports = { config };
