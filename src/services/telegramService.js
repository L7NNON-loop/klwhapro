const PQueue = require('p-queue').default;
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

class TelegramService {
  constructor({ apiId, apiHash, onIncomingMessage }) {
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.onIncomingMessage = onIncomingMessage;
    this.clients = new Map();
    this.authState = new Map();
    this.queue = new PQueue({ concurrency: 1, intervalCap: 20, interval: 60_000 });
  }

  async requestCode(phoneNumber) {
    const sessionId = `phone:${phoneNumber}`;
    const client = await this.getOrCreateClient(sessionId);

    const result = await client.sendCode(
      { apiId: this.apiId, apiHash: this.apiHash },
      phoneNumber
    );

    this.authState.set(sessionId, {
      phoneNumber,
      phoneCodeHash: result.phoneCodeHash
    });

    return {
      sessionId,
      phoneCodeHash: result.phoneCodeHash
    };
  }

  async verifyCode({ phoneNumber, code, password, phoneCodeHash }) {
    const sessionId = `phone:${phoneNumber}`;
    const client = await this.getOrCreateClient(sessionId);

    await client.start({
      phoneNumber: async () => phoneNumber,
      phoneCode: async () => code,
      password: async () => password || '',
      phoneCodeHash: async () => phoneCodeHash,
      onError: (err) => {
        throw err;
      }
    });

    this.attachMessageHandler(sessionId, client);

    const me = await client.getMe();
    this.clients.set(sessionId, { client, stringSession: client.session.save() });

    return {
      sessionId,
      user: {
        id: Number(me.id),
        username: me.username || '',
        firstName: me.firstName || '',
        lastName: me.lastName || '',
        phone: me.phone || phoneNumber
      }
    };
  }

  async listSessions() {
    return Array.from(this.clients.keys()).map((sessionId) => ({ sessionId }));
  }

  async deleteSession(sessionId) {
    const entry = this.clients.get(sessionId);
    if (!entry) return false;
    await entry.client.disconnect();
    this.clients.delete(sessionId);
    return true;
  }

  async listDialogs(sessionId, limit = 50) {
    const client = this.getClient(sessionId);
    const dialogs = await client.getDialogs({ limit });
    return dialogs.map((dialog) => ({
      id: String(dialog.id),
      title: dialog.title || '',
      unreadCount: dialog.unreadCount || 0,
      isUser: Boolean(dialog.isUser),
      isGroup: Boolean(dialog.isGroup),
      isChannel: Boolean(dialog.isChannel)
    }));
  }

  async listMessages(sessionId, peer, limit = 50) {
    const client = this.getClient(sessionId);
    const messages = await client.getMessages(peer, { limit });
    return messages.map((m) => ({
      id: m.id,
      text: m.message || '',
      date: m.date ? m.date.valueOf() : Date.now(),
      out: Boolean(m.out),
      fromId: m.fromId ? String(m.fromId) : ''
    }));
  }

  async sendMessage(sessionId, peer, message, options = {}) {
    return this.queue.add(async () => {
      const client = this.getClient(sessionId);
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          const sent = await client.sendMessage(peer, { message, ...options });
          return {
            id: sent.id,
            date: sent.date ? sent.date.valueOf() : Date.now(),
            peer: String(peer)
          };
        } catch (error) {
          attempts += 1;
          if (attempts >= maxAttempts) throw error;
          await new Promise((r) => setTimeout(r, attempts * 1000));
        }
      }

      throw new Error('Unable to send message');
    });
  }

  async markRead(sessionId, peer, maxId) {
    const client = this.getClient(sessionId);
    await client.markAsRead(peer, maxId);
    return { ok: true };
  }

  async listGroups(sessionId) {
    const dialogs = await this.listDialogs(sessionId, 200);
    return dialogs.filter((dialog) => dialog.isGroup);
  }

  async listGroupMembers(sessionId, groupId, limit = 100) {
    const client = this.getClient(sessionId);
    const participants = await client.getParticipants(groupId, { limit });
    return participants.map((p) => ({
      id: Number(p.id),
      username: p.username || '',
      firstName: p.firstName || ''
    }));
  }

  async broadcastGroups(sessionId, message) {
    const groups = await this.listGroups(sessionId);
    const results = [];
    for (const group of groups) {
      const result = await this.sendMessage(sessionId, group.id, message);
      results.push({ groupId: group.id, ...result });
    }
    return results;
  }

  getClient(sessionId) {
    const entry = this.clients.get(sessionId);
    if (!entry) {
      throw new Error('SessionId inválido');
    }
    return entry.client;
  }

  async getOrCreateClient(sessionId) {
    const existing = this.clients.get(sessionId);
    if (existing) return existing.client;

    const client = new TelegramClient(new StringSession(''), this.apiId, this.apiHash, {
      connectionRetries: 5
    });
    await client.connect();
    this.clients.set(sessionId, { client, stringSession: '' });
    return client;
  }

  attachMessageHandler(sessionId, client) {
    if (!this.onIncomingMessage || client.__webmovelHookAttached) {
      return;
    }

    client.__webmovelHookAttached = true;
    client.addEventHandler(async (event) => {
      if (!event.message) return;
      await this.onIncomingMessage({
        sessionId,
        text: event.message.message || '',
        peer: String(event.message.peerId || ''),
        sender: event.message.sender || {}
      });
    });
  }
}

module.exports = { TelegramService };
