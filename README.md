# WebMovel Telegram Automation API – Backend de Automação Avançado

Backend completo em **Node.js + Express** para automação Telegram com autenticação por `x-api-key`, sessões Telegram via **GramJS (`telegram`)**, sistema de comandos, auto-reply, webhook, logs e envio em fila para evitar flood.

## Funcionalidades

- Segurança
  - Validação de `x-api-key` em **todas** as rotas
  - Rate limit (padrão: `100 req/min` por IP)
  - Validação de payload com Zod
  - Tratamento estruturado de erros
- Telegram
  - Login por código (`request-code` + `verify-code`)
  - Gestão de sessões
  - Listagem de diálogos, mensagens, grupos e membros
  - Envio de mensagens simples, reply, bulk e broadcast para grupos
- Automação
  - Comandos customizados (`/start`, `/help`, `/price`, etc.)
  - Variáveis dinâmicas em resposta: `{firstName}`, `{username}`, `{phone}`, `{date}`
  - Auto-reply por palavra-chave
- Integrações
  - Webhook para eventos (`new_message`, `message_sent`, `new_dialog`)
- Observabilidade
  - Endpoint de logs da API

---

## Stack

- Node.js
- Express.js
- GramJS (`telegram`)
- express-rate-limit
- axios
- zod
- p-queue

---

## Configuração

Crie seu `.env` com base no `.env.example`:

```bash
cp .env.example .env
```

### Variáveis obrigatórias

```env
API_KEY=webmovel
PORT=3000
CORS_ORIGIN=*
TELEGRAM_API_ID=39907892
TELEGRAM_API_HASH=f7dbae684bea59a049a810fc9e7bb333
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000
REQUEST_TIMEOUT_MS=15000
MAX_LOG_ENTRIES=1000
```

---

## Instalação e execução

```bash
npm install
npm run start
```

Servidor local: `http://localhost:3000`

Servidor Render informado: `https://server-webmovel.onrender.com`

> Todos os requests exigem: `x-api-key: webmovel`

---

## Autenticação

### Solicitar código

`POST /v1/auth/request-code`

```json
{
  "phoneNumber": "+258XXXXXXXXX"
}
```

Resposta:

```json
{
  "sessionId": "phone:+258XXXXXXXXX",
  "phoneCodeHash": "HASH_VALUE"
}
```

### Verificar código

`POST /v1/auth/verify-code`

```json
{
  "phoneNumber": "+258XXXXXXXXX",
  "code": "12345",
  "phoneCodeHash": "HASH_VALUE",
  "password": "OPCIONAL_2FA"
}
```

---

## Endpoints principais

### Health

- `GET /health`

### Sessões

- `GET /v1/sessions`
- `DELETE /v1/sessions/:sessionId`

### Diálogos

- `GET /v1/dialogs?sessionId=phone:+258...&limit=50`

### Mensagens

- `GET /v1/messages?sessionId=...&peer=username&limit=50`
- `POST /v1/messages/send`
- `POST /v1/messages/reply`
- `POST /v1/messages/read`
- `POST /v1/messages/bulk`
- `POST /v1/messages/broadcast-groups`

### Grupos

- `GET /v1/groups?sessionId=...`
- `GET /v1/groups/members?sessionId=...&groupId=...&limit=100`

### Comandos

- `GET /v1/comandos`
- `POST /v1/comandos`
- `DELETE /v1/comandos/:comando`

### Auto-reply

- `POST /v1/automation/auto-reply`

### Webhook

- `POST /v1/webhook/register`

### Logs

- `GET /v1/logs`

---

## Exemplos cURL

### Health

```bash
curl -X GET "http://localhost:3000/health" \
  -H "x-api-key: webmovel"
```

### Enviar mensagem

```bash
curl -X POST "http://localhost:3000/v1/messages/send" \
  -H "Content-Type: application/json" \
  -H "x-api-key: webmovel" \
  -d '{
    "sessionId":"phone:+258XXXXXXXXX",
    "peer":"username_or_id",
    "message":"Olá do WebMovel"
  }'
```

### Registrar comando

```bash
curl -X POST "http://localhost:3000/v1/comandos" \
  -H "Content-Type: application/json" \
  -H "x-api-key: webmovel" \
  -d '{
    "comando":"/price",
    "resposta":"Olá {firstName}, o preço é 10 USD em {date}."
  }'
```

### Registrar webhook

```bash
curl -X POST "http://localhost:3000/v1/webhook/register" \
  -H "Content-Type: application/json" \
  -H "x-api-key: webmovel" \
  -d '{
    "sessionId":"phone:+258XXXXXXXXX",
    "url":"https://example.com/webhook"
  }'
```

---

## Estrutura

```txt
src/
  config.js
  server.js
  services/
    telegramService.js
    automation.js
    webhookService.js
    logger.js
  storage/
    jsonStore.js
data/
  commands.json
  auto-replies.json
  webhooks.json
```

---

## Comportamento de erros

Formato padrão:

```json
{
  "error": "SessionId inválido"
}
```

Status:

- `200` OK
- `400` Bad Request
- `401` Não autorizado
- `500` Erro interno do servidor

---

## Observações de produção (Render)

- Defina variáveis no painel do Render.
- Recomenda-se Redis para filas/sessões distribuídas.
- Recomenda-se MongoDB/PostgreSQL para regras persistentes em escala.
- Ative monitoramento externo no `/health`.

