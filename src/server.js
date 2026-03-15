const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { config } = require('./config');
const { InMemoryLogger } = require('./services/logger');
const { TelegramService } = require('./services/telegramService');
const { AutomationService } = require('./services/automation');
const { WebhookService } = require('./services/webhookService');

const app = express();
const logger = new InMemoryLogger(config.maxLogEntries);
const automation = new AutomationService();
const webhooks = new WebhookService(config.requestTimeoutMs);

const telegram = new TelegramService({
  apiId: config.telegramApiId,
  apiHash: config.telegramApiHash,
  onIncomingMessage: async ({ sessionId, text, peer, sender }) => {
    await webhooks.emit('new_message', { sessionId, peer, text });

    if (!text) return;

    if (text.startsWith('/')) {
      const command = await automation.findCommand(text);
      if (command) {
        const reply = automation.formatTemplate(command.response, sender);
        await telegram.sendMessage(sessionId, peer, reply);
      }
    }

    const autoReply = await automation.findAutoReply(sessionId, text);
    if (autoReply) {
      const reply = automation.formatTemplate(autoReply.reply, sender);
      await telegram.sendMessage(sessionId, peer, reply);
    }
  }
});

app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));
app.use(
  rateLimit({
    windowMs: config.rateLimitWindowMs,
    max: config.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit excedido. Tente novamente mais tarde.' }
  })
);

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.add({
      endpoint: req.originalUrl,
      method: req.method,
      status: res.statusCode,
      latencyMs: Date.now() - startedAt
    });
  });
  next();
});

app.use((req, res, next) => {
  if (req.header('x-api-key') !== config.apiKey) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  return next();
});

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const schemas = {
  requestCode: z.object({ phoneNumber: z.string().min(8) }),
  verifyCode: z.object({
    phoneNumber: z.string().min(8),
    code: z.string().min(2),
    phoneCodeHash: z.string().min(2),
    password: z.string().optional()
  }),
  sendMessage: z.object({
    sessionId: z.string().min(1),
    peer: z.union([z.string(), z.number()]),
    message: z.string().min(1)
  }),
  replyMessage: z.object({
    sessionId: z.string().min(1),
    peer: z.union([z.string(), z.number()]),
    message: z.string().min(1),
    replyToMsgId: z.number()
  }),
  readMessage: z.object({
    sessionId: z.string().min(1),
    peer: z.union([z.string(), z.number()]),
    maxId: z.number()
  }),
  bulk: z.object({
    sessionId: z.string().min(1),
    peers: z.array(z.union([z.string(), z.number()])).min(1),
    message: z.string().min(1)
  }),
  command: z.object({
    comando: z.string().min(1),
    resposta: z.string().min(1)
  }),
  autoReply: z.object({
    sessionId: z.string().min(1),
    trigger: z.string().min(1),
    reply: z.string().min(1)
  }),
  webhook: z.object({
    sessionId: z.string().min(1),
    url: z.string().url()
  })
};

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
  return result.data;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'telegram-automation-api', uptime: process.uptime() });
});

app.post('/v1/auth/request-code', asyncHandler(async (req, res) => {
  const body = parse(schemas.requestCode, req.body);
  const data = await telegram.requestCode(body.phoneNumber);
  res.json(data);
}));

app.post('/v1/auth/verify-code', asyncHandler(async (req, res) => {
  const body = parse(schemas.verifyCode, req.body);
  const data = await telegram.verifyCode(body);
  res.json(data);
}));

app.get('/v1/sessions', asyncHandler(async (req, res) => {
  const items = await telegram.listSessions();
  res.json({ items });
}));

app.delete('/v1/sessions/:sessionId', asyncHandler(async (req, res) => {
  const ok = await telegram.deleteSession(req.params.sessionId);
  res.json({ ok });
}));

app.get('/v1/dialogs', asyncHandler(async (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  const limit = Number(req.query.limit || 50);
  const items = await telegram.listDialogs(sessionId, limit);
  await webhooks.emit('new_dialog', { sessionId, count: items.length });
  res.json({ items });
}));

app.get('/v1/messages', asyncHandler(async (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  const peer = String(req.query.peer || '');
  const limit = Number(req.query.limit || 50);
  const items = await telegram.listMessages(sessionId, peer, limit);
  res.json({ items });
}));

app.post('/v1/messages/send', asyncHandler(async (req, res) => {
  const body = parse(schemas.sendMessage, req.body);
  const data = await telegram.sendMessage(body.sessionId, body.peer, body.message);
  await webhooks.emit('message_sent', { sessionId: body.sessionId, peer: String(body.peer), text: body.message });
  res.json(data);
}));

app.post('/v1/messages/reply', asyncHandler(async (req, res) => {
  const body = parse(schemas.replyMessage, req.body);
  const data = await telegram.sendMessage(body.sessionId, body.peer, body.message, { replyTo: body.replyToMsgId });
  res.json(data);
}));

app.post('/v1/messages/read', asyncHandler(async (req, res) => {
  const body = parse(schemas.readMessage, req.body);
  const data = await telegram.markRead(body.sessionId, body.peer, body.maxId);
  res.json(data);
}));

app.post('/v1/messages/bulk', asyncHandler(async (req, res) => {
  const body = parse(schemas.bulk, req.body);
  const results = [];
  for (const peer of body.peers) {
    const sent = await telegram.sendMessage(body.sessionId, peer, body.message);
    results.push({ peer: String(peer), ...sent });
  }
  res.json({ items: results });
}));

app.get('/v1/groups', asyncHandler(async (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  const items = await telegram.listGroups(sessionId);
  res.json({ items });
}));

app.get('/v1/groups/members', asyncHandler(async (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  const groupId = String(req.query.groupId || '');
  const limit = Number(req.query.limit || 100);
  const members = await telegram.listGroupMembers(sessionId, groupId, limit);
  res.json({ members });
}));

app.post('/v1/messages/broadcast-groups', asyncHandler(async (req, res) => {
  const body = parse(schemas.sendMessage.extend({ peer: z.any().optional() }).omit({ peer: true }), req.body);
  const items = await telegram.broadcastGroups(body.sessionId, body.message);
  res.json({ items });
}));

app.get('/v1/comandos', asyncHandler(async (req, res) => {
  const items = await automation.listCommands();
  res.json({ items });
}));

app.post('/v1/comandos', asyncHandler(async (req, res) => {
  const body = parse(schemas.command, req.body);
  const item = await automation.addCommand(body.comando, body.resposta);
  res.json(item);
}));

app.delete('/v1/comandos/:comando', asyncHandler(async (req, res) => {
  const ok = await automation.removeCommand(req.params.comando);
  res.json({ ok });
}));

app.post('/v1/automation/auto-reply', asyncHandler(async (req, res) => {
  const body = parse(schemas.autoReply, req.body);
  const item = await automation.addAutoReply(body);
  res.json(item);
}));

app.post('/v1/webhook/register', asyncHandler(async (req, res) => {
  const body = parse(schemas.webhook, req.body);
  const item = await webhooks.register(body.sessionId, body.url);
  res.json(item);
}));

app.get('/v1/logs', (req, res) => {
  res.json({ items: logger.all() });
});

app.use((error, req, res, next) => {
  logger.add({
    endpoint: req.originalUrl,
    method: req.method,
    status: error.status || 500,
    error: error.message
  });

  const status = error.status || 500;
  const message = status === 500 ? 'Erro interno do servidor' : error.message;
  res.status(status).json({ error: message });
});

app.listen(config.port, () => {
  console.log(`WebMovel Telegram Automation API running on port ${config.port}`);
});
