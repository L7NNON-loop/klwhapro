const { JsonStore } = require('../storage/jsonStore');

function normalizeCommand(command) {
  return String(command || '').trim().toLowerCase();
}

class AutomationService {
  constructor() {
    this.commandsStore = new JsonStore('commands.json', []);
    this.autoReplyStore = new JsonStore('auto-replies.json', []);
  }

  async listCommands() {
    return this.commandsStore.read();
  }

  async addCommand(command, response) {
    const normalized = normalizeCommand(command);
    const list = await this.commandsStore.read();
    const exists = list.find((c) => normalizeCommand(c.command) === normalized);

    if (exists) {
      exists.response = response;
      await this.commandsStore.write(list);
      return exists;
    }

    const item = { command: normalized, response };
    list.push(item);
    await this.commandsStore.write(list);
    return item;
  }

  async removeCommand(command) {
    const normalized = normalizeCommand(command);
    const list = await this.commandsStore.read();
    const filtered = list.filter((c) => normalizeCommand(c.command) !== normalized);
    await this.commandsStore.write(filtered);
    return filtered.length !== list.length;
  }

  async findCommand(text) {
    const trigger = normalizeCommand((text || '').split(' ')[0]);
    const list = await this.commandsStore.read();
    return list.find((c) => normalizeCommand(c.command) === trigger) || null;
  }

  async addAutoReply(rule) {
    const list = await this.autoReplyStore.read();
    const item = {
      sessionId: rule.sessionId,
      trigger: String(rule.trigger).toLowerCase(),
      reply: rule.reply,
      createdAt: new Date().toISOString()
    };
    list.push(item);
    await this.autoReplyStore.write(list);
    return item;
  }

  async findAutoReply(sessionId, text) {
    const content = String(text || '').toLowerCase();
    const list = await this.autoReplyStore.read();
    return list.find((r) => r.sessionId === sessionId && content.includes(r.trigger)) || null;
  }

  formatTemplate(template, user = {}) {
    const map = {
      '{firstName}': user.firstName || '',
      '{username}': user.username || '',
      '{phone}': user.phone || '',
      '{date}': new Date().toISOString()
    };

    return Object.entries(map).reduce((acc, [key, value]) => acc.replaceAll(key, value), template);
  }
}

module.exports = { AutomationService };
