# Segurança — Financeiro + Cadastros

Medidas aplicadas para reduzir o impacto de um vazamento de código, roubo de
credenciais ou acesso indevido ao servidor. Cobre tanto o módulo financeiro
quanto os cadastros (inquilino, fiador, imóvel, contrato).

## Autenticação

- Toda rota sob `/api` exige o header `x-api-key`, comparado em **tempo
  constante** sobre o **hash SHA-256** das duas chaves (não sobre a string
  crua), para que nem o comprimento da chave real vaze pelo tempo de resposta.
- `x-usuario` é sanitizado (remove quebras de linha) e truncado em 120
  caracteres antes de virar registro de auditoria.
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
- **Regra "vencimento + 1 dia < hoje" corrigida**: o cron só marca `ATRASADO`
  a partir de 2 dias corridos após o vencimento (antes marcava 1 dia mais
  cedo, violando a carência combinada).
- **Scoring usa a data real do pagamento**, não o campo `status` da fatura:
  antes, pagar uma fatura vencida *antes* do cron da madrugada rodar
  (portanto ainda `PENDENTE` no banco) pontuava como pagamento em dia.
- **`gerarFaturaMensal` é seguro sob concorrência**: duas chamadas
  simultâneas para o mesmo contrato/competência (ex.: API e cron ao mesmo
  tempo) não derrubam uma delas com erro de unicidade — a perdedora da
  corrida recebe de volta a fatura já criada pela outra.
- Validação de `valorPago` (finito, > 0) também existe dentro do
  `pagamentoService`, não só no zod da rota — protege chamadas diretas ao
  service (jobs, scripts, testes).
- **CPF validado por dígito verificador** (`src/lib/cpf.ts`), não só por
  formato — rejeita sequências como `111.111.111-11` que passam numa checagem
  ingênua de tamanho. CPF duplicado retorna erro amigável (409), não o erro
  bruto do banco.
- **Garantia obrigatória em contrato**: caução ≥ 3x o aluguel OU fiador ativo
  vinculado — validado no service, não confia em nada vindo do cliente além
  dos valores numéricos.
- **Fiador é verificado antes de vincular**: precisa existir, não estar
  soft-deletado e estar `ativo`; senão o contrato não é criado.
- **Imóvel não pode ser alugado duas vezes**: contrato só é criado se o
  imóvel estiver `DISPONIVEL`; a criação do contrato e a mudança de status do
  imóvel para `ALUGADO` ocorrem na mesma transação.
- **Soft delete em Inquilino, Fiador, Imóvel e Contrato** (`deletedAt`):
  excluir nunca apaga histórico de contratos/faturas/pagamentos; listagens
  filtram `deletedAt: null` por padrão.
- **Duração máxima de contrato (20 anos)**: evita que uma `dataFim` absurda
  gere milhares de parcelas de uma vez (defesa em duas camadas — validação no
  `contratoService` e uma trava dura de 600 meses em `gerarParcelasContrato`).

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
