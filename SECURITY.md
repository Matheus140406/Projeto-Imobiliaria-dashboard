# Segurança — Módulo Financeiro

Medidas aplicadas para reduzir o impacto de um vazamento de código, roubo de
credenciais ou acesso indevido ao servidor.

## Autenticação

- Toda rota sob `/api` exige o header `x-api-key`, comparado em **tempo
  constante** (`crypto.timingSafeEqual`) para evitar timing attacks.
- Não há sistema de usuários ainda (isso é escopo do Edu). Até lá, o header
  `x-usuario` identifica o operador para fins de auditoria, mas só é aceito
  junto com uma API key válida — **não é autenticação real**, é um rótulo.
- `registradoPor` enviado no corpo da requisição de pagamento é **ignorado**;
  a auditoria sempre usa o operador autenticado (`x-usuario`), evitando que
  alguém forje quem registrou um pagamento.

## Validação de entrada

- Todo body/params/query passa por `zod` (tipo, tamanho máximo, enum de
  `metodo` de pagamento) antes de tocar o banco.
- IDs são validados como string (1–64 chars) antes de qualquer consulta.

## Regras de negócio que evitam fraude

- **Pagamento parcial não fecha fatura**: `valorPago` precisa ser >= ao
  `valorTotal` da fatura (com tolerância de 1 centavo para arredondamento).
  Antes, qualquer valor marcava a fatura como paga.
- Erros de negócio (`AppError`) retornam mensagem clara; erros inesperados
  (bug, falha de banco) retornam **apenas** `"Erro interno"` — detalhes reais
  vão só para o log do servidor, nunca para o cliente.

## Hardening HTTP

- `helmet()` — cabeçalhos de segurança (HSTS, X-Frame-Options,
  X-Content-Type-Options, etc.).
- `x-powered-by` desabilitado.
- CORS restrito à lista em `CORS_ORIGIN` (nunca `*`).
- Limite de corpo de requisição em 100kb (`entity.too.large` → 413).
- Rate limiting: 300 req/15min por IP em toda a API, 30 req/15min no endpoint
  de pagamentos (alvo mais sensível a abuso).

## Configuração

- `API_KEY` obrigatória (mínimo 32 chars) e validada com `zod` na subida —
  o processo encerra com erro claro se faltar, em vez de rodar inseguro.
- Segredos ficam só em `.env` (git-ignorado). Gere a chave com
  `openssl rand -hex 32`.

## Limitações conhecidas (fora do escopo atual)

- Valores monetários são `Float` no schema (SQLite não tem `Decimal` nativo
  no Prisma); mitigado com arredondamento consistente e tolerância de 1
  centavo nas comparações, mas migrar para inteiro em centavos é mais robusto
  a longo prazo.
- Não há autenticação por usuário/papel (RBAC) — a API key é única e dá
  acesso total. Adequado para serviço-a-serviço, não para múltiplos
  operadores até o sistema de usuários existir.
- SQLite em dev não tem criptografia em repouso; em produção, usar Postgres
  com disco criptografado.
- `ts-node-dev` (dependência de desenvolvimento) traz uma vulnerabilidade
  transitiva conhecida em `brace-expansion`/`glob`/`rimraf` sem correção
  disponível upstream; não afeta o build de produção (`npm run build && npm
  start` não usa `ts-node-dev`).
