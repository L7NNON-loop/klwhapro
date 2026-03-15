const axios = require('axios');
const { JsonStore } = require('../storage/jsonStore');

class WebhookService {
  constructor(timeoutMs = 15_000) {
    this.timeoutMs = timeoutMs;
    this.store = new JsonStore('webhooks.json', []);
  }

  async register(sessionId, url) {
    const hooks = await this.store.read();
    const existing = hooks.find((item) => item.sessionId === sessionId);
    if (existing) {
      existing.url = url;
      existing.updatedAt = new Date().toISOString();
      await this.store.write(hooks);
      return existing;
    }

    const item = { sessionId, url, createdAt: new Date().toISOString() };
    hooks.push(item);
    await this.store.write(hooks);
    return item;
  }

  async emit(event, payload) {
    const hooks = await this.store.read();
    const targets = hooks.filter((h) => h.sessionId === payload.sessionId);

    await Promise.allSettled(
      targets.map((target) =>
        axios.post(target.url, { event, ...payload }, { timeout: this.timeoutMs })
      )
    );
  }
}

module.exports = { WebhookService };
