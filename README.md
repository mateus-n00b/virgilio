# Virgílio — ninguém atravessa sozinho

App web e mobile de **prova de vida periódica** para quem mora só ou longe da família. A pessoa escolhe gente próxima — amigos, vizinhos, conhecidos — para serem seus **Virgílios** (como o guia de Dante na *Divina Comédia*). A cada *x* dias o app pede um “Estou bem”. Sem resposta em *x + y* dias, os Virgílios são avisados e veem as instruções deixadas (“alimente meu gato”, “a chave está com a vizinha do 102”) e, se a pessoa tiver compartilhado, a **última localização conhecida**.

Mesma arquitetura e configuração do promoAE: `backend/` (FastAPI + SQLAlchemy + Alembic), `frontend/` (Next.js 16), `mobile/` (Expo SDK 58) e um único projeto Vercel com dois serviços e Postgres (Neon).

## Como funciona

```
check-in ──── x dias ────▶ prazo ──── y dias ────▶ alerta
   OK          lembrete à pessoa (e-mail + push)   Virgílios avisados (e-mail + push)
```

| Situação | O que acontece |
|---|---|
| Prazo de *x* dias vence | Lembrete à pessoa por e-mail (com link de confirmação em 1 clique) e push. O app também agenda um **lembrete local** no aparelho para o fim do prazo, que funciona sem internet. |
| Ainda sem resposta | Novo lembrete a cada ~20 h. |
| *x + y* dias sem resposta | **Alerta**: todos os Virgílios que aceitaram recebem e-mail (e push, se usam o app) com o link pessoal deles. |
| Ninguém responde ao alerta | Aviso repetido a cada ~20 h, até 7 vezes. Para quando um Virgílio toca em **“Vou verificar”** (os outros ficam sabendo). |
| A pessoa confirma, ou um Virgílio toca em **“Encontrei, está bem”** | Alerta encerrado, todos avisados, ciclo recomeça. |
| **SOS** | A própria pessoa avisa todos os Virgílios na hora. |
| **Pausa** | Viagem, internação planejada: nada é cobrado até a data escolhida (até 60 dias); o ciclo recomeça no fim dela. |

**Virgílios não precisam de conta.** Recebem um link pessoal (`/v/<token>`) pelo WhatsApp (botão pronto no app), por qualquer outro meio ou por e-mail. Ao aceitar, informam o e-mail onde querem receber os alertas. Quem aceita estando logado no app passa a receber push também e vê a pessoa na aba **Protegidos**.

### Privacidade

- **Instruções** e **localização** ficam criptografadas no banco (Fernet, chave fora do banco: `INSTRUCTIONS_KEY`).
- Enquanto está tudo bem, o Virgílio só vê que a pessoa está bem e quando foi a última prova de vida. **Telefone, endereço, instruções e última localização só aparecem enquanto há um alerta aberto** e somem quando ele é encerrado.
- **Localização é opcional, a cada prova de vida**: a chave “Compartilhar minha localização” no app/site (lembrada no aparelho) ou o botão “Estou bem e compartilhar minha localização” na página do link do e-mail. Só a última é guardada; check-ins sem localização mantêm a anterior como “última conhecida”. A pessoa pode apagá-la a qualquer momento. No app, só a permissão “durante o uso” é pedida (sem rastreamento em segundo plano).
- Exclusão de conta apaga tudo (LGPD).

## Rodando localmente

### Com Docker

```bash
cp backend/.env.example backend/.env    # ajuste JWT_SECRET e, se quiser e-mail, SMTP_*
docker compose up --build
```

Site em http://localhost:3001, API em http://localhost:8001/api (documentação em `/api/docs`). O serviço `cron` roda a varredura a cada 15 minutos.

### Sem Docker

```bash
# backend (Python 3.12)
cd backend
uv venv -p 3.12 .venv && uv pip install -p .venv/bin/python -r requirements.txt   # ou python -m venv + pip
cp .env.example .env
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload
.venv/bin/python -m app.cli sweep          # varredura manual (lembretes e alertas)

# frontend (outro terminal)
cd frontend && npm install && npm run dev  # http://localhost:3000, proxy de /api para :8000

# mobile: ver mobile/README.md
```

Sem SMTP em `ENV=dev`, o link de redefinição de senha volta na resposta da API (para testar o fluxo).

## E-mail

Mesma configuração do promoAE: mesmo módulo de envio e as mesmas variáveis `SMTP_HOST`, `SMTP_PORT` (587 = STARTTLS, 465 = SSL), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, além de `SUPPORT_EMAIL` (contato exibido no site). **Copie os valores `SMTP_*` do projeto promoAE na Vercel** para este projeto. A Vercel bloqueia só a porta 25.

O e-mail é essencial: é por ele que os Virgílios sem o app recebem os alertas. Sem SMTP, o painel avisa a pessoa de que nenhum Virgílio pode ser avisado (a não ser os que usam o app com push).

## Deploy na Vercel

Igual ao promoAE: **um projeto Vercel** com os serviços do [vercel.json](vercel.json) (`backend` em `/api/*`, `frontend` no resto) e Postgres Neon.

1. **Projeto**: importe o repositório com *Root Directory* na raiz.
2. **Banco**: *Storage → Neon*, região São Paulo (`sa-east-1`), sem prefixo de variável. Cria `DATABASE_URL` (pooled) e `DATABASE_URL_UNPOOLED`.
3. **Migrações** (a Vercel não roda o Alembic), da sua máquina, com a URL **sem pooling**:
   ```bash
   cd backend
   DATABASE_URL='<DATABASE_URL_UNPOOLED>' .venv/bin/alembic upgrade head
   ```
4. **Variáveis**: preencha as de [.env.vercel.example](.env.vercel.example). Obrigatórias: `ENV=prod`, `JWT_SECRET` (32+), `FRONTEND_URL`, `INSTRUCTIONS_KEY`, `CRON_SECRET` e os `SMTP_*`. Faça *Redeploy* depois de alterar. Teste em `https://<domínio>/api/health`.
5. **Varredura (cron)** — é ela que manda lembretes e alertas:
   - O `vercel.json` já agenda `/api/internal/sweep` **1x por dia** (limite do plano Hobby). A Vercel envia `Authorization: Bearer <CRON_SECRET>` sozinha.
   - Para lembretes e alertas **no horário certo**, ative também o workflow [.github/workflows/sweep.yml](.github/workflows/sweep.yml), que chama a mesma rota **de hora em hora**, de graça: em *Settings → Secrets → Actions* do GitHub, crie `VIRGILIO_URL` (ex.: `https://virgilio-alpha.vercel.app`) e `CRON_SECRET`. No plano Pro da Vercel, dá para trocar o cron para `0 * * * *`.
   - Só com o cron diário, o alerta pode sair até ~1 dia depois de *x + y*.
6. **App mobile**: build com `EXPO_PUBLIC_API_URL=https://<domínio>/api` ([mobile/README.md](mobile/README.md)).

**Cuidados**
- Nunca use `ENV=dev` em URL pública. Com `ENV=prod` (o padrão), a API não sobe com `JWT_SECRET` fraco ou sem banco.
- **Não troque `INSTRUCTIONS_KEY`** depois de ter dados: instruções e localizações gravadas ficariam ilegíveis.
- Os limites por IP ficam em memória (valem por instância serverless), como no promoAE.

## Testes

```bash
cd backend && .venv/bin/pytest -q                      # SQLite em memória
TEST_DATABASE_URL=postgresql+psycopg://u:s@host/db_teste .venv/bin/pytest -q   # Postgres
```

Cobrem o ciclo completo (lembrete, alerta, avisos repetidos e limite, “vou verificar”, encerramento), SOS, pausa, link de confirmação de um ciclo só, reenvio após falha de SMTP, push, convite/aceite/recusa, visibilidade de instruções e localização só durante alerta, criptografia em repouso, redefinição de senha e exclusão de conta.

## API (resumo)

| Rota | Uso |
|---|---|
| `POST /api/auth/register`, `/login`, `/password/forgot`, `/password/reset` | Conta (e-mail e senha) |
| `GET/PUT /api/me/watch` | Estado e ajuste do ciclo (x, y, pausa) |
| `POST /api/me/check-in` `{location?}` | “Estou bem” |
| `POST /api/me/sos` `{location?}` | Pedido de ajuda |
| `DELETE /api/me/location` | Apaga a última localização |
| `POST /api/check-in/link` `{token, location?}` | Confirmação pelo link do e-mail (sem login) |
| `/api/me/guardians` | Virgílios (CRUD, reenvio de convite) |
| `/api/me/instructions` | Instruções (CRUD) |
| `GET /api/me/protecting` | De quem sou Virgílio |
| `GET /api/guardian/{token}` + `accept`, `decline`, `ack`, `resolve` | Link pessoal do Virgílio |
| `GET /api/internal/sweep` | Varredura (cron, com `CRON_SECRET`) |

## Limitações conhecidas / próximos passos

- Alertas por WhatsApp (API oficial, template aprovado) e SMS, além de e-mail e push.
- Escalonamento por ordem de prioridade dos Virgílios.
- Verificação dos recibos de entrega do Expo (hoje conta como enviado quando o Expo aceita).
- Limites por IP em Redis (Upstash) para valer entre instâncias.
