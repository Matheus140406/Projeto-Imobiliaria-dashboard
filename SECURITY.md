# Segurança — Financeiro + Cadastros

Medidas aplicadas para reduzir o impacto de um vazamento de código, roubo de
credenciais ou acesso indevido ao servidor. Cobre tanto o módulo financeiro
quanto os cadastros (inquilino, fiador, imóvel, contrato).

## Autenticação

- Toda rota sob `/api` exige o header `x-api-key`, comparado em **tempo
  constante** sobre o **hash SHA-256** das duas chaves (não sobre a string
  crua), para que nem o comprimento da chave real vaze pelo tempo de resposta.
- `x-usuario` é sanitizado (remove quebras de linha) e truncado em 120
  caracteres antes de virar registro de auditoria. Continua existindo como
  rótulo simples para operações que não exigem login (ex.: registrar
  pagamento, criar cadastro).
- `registradoPor` enviado no corpo da requisição de pagamento é **ignorado**;
  a auditoria sempre usa o operador autenticado (`x-usuario`), evitando que
  alguém forje quem registrou um pagamento.
- **RBAC leve com JWT**: existe agora um modelo `Usuario` (`ADMIN` |
  `OPERADOR`), com bootstrap único (`POST /api/auth/registrar-primeiro-admin`,
  só funciona com zero usuários cadastrados), login
  (`POST /api/auth/login`, senha com `bcrypt`, mensagem de erro idêntica para
  "usuário não existe" e "senha errada" para evitar enumeração de contas) e
  um JWT de 12h. A `x-api-key` continua sendo obrigatória para toda a
  `/api` — o JWT é uma camada de identidade **em cima** dela, não no lugar
  dela.
- **Ações destrutivas exigem ADMIN logado** (`exigirPapel("ADMIN")`):
  excluir inquilino/fiador/imóvel e encerrar contrato retornam 401 sem token
  e 403 se o token for de um `OPERADOR`.

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
- **Garantia obrigatória em contrato**: caução (qualquer valor > 0 — decisão
  comercial do usuário, sem piso automático de "3x o aluguel") OU fiador ativo
  vinculado — validado no service, não confia em nada vindo do cliente além
  dos valores numéricos.
- **Exclusão de contrato é lógica, nunca física**: `excluirContrato` só marca
  `status: EXCLUIDO` + `deletedAt`, igual a `encerrarContrato`. O contrato
  nunca é removido do banco, então nenhuma fatura/pagamento/aditivo/renovação
  que referencia esse contrato (chaves estrangeiras sem cascade) fica órfã.
  Só as faturas ainda `PENDENTE` desse contrato são canceladas (saem de "a
  receber"); faturas `PAGO`/`ATRASADO` são preservadas como histórico. A
  operação é sempre escopada por `contratoId` — nunca toca em faturas de
  outro contrato, mesmo do mesmo inquilino/imóvel. Exige ADMIN logado.
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
- **Sobreposição de datas no mesmo imóvel**: além do status `DISPONIVEL`,
  o `contratoService` verifica explicitamente que não existe outro contrato
  ativo do mesmo imóvel com período conflitante — defesa em profundidade
  contra status desatualizado ou corrida entre duas criações simultâneas.
- **Status de imóvel `ALUGADO` não é editável manualmente**: só o ciclo de
  vida do contrato (criar/encerrar) muda para `ALUGADO`/`DISPONIVEL`; a rota
  de edição bloqueia tentativa de setar status num imóvel já alugado.
- **Log de atividade não derruba a operação principal**: se gravar o log
  falhar por qualquer motivo, o erro é só logado no console — nunca impede
  a criação/edição/exclusão do cadastro em si.
- **Geração de PDF isolada em try/catch dedicado**: erros do PDFKit viram
  erro genérico tratado pelo handler central, nunca stack trace exposta.
- **Aditivo contratual nunca é retroativo**: `dataVigencia` precisa ser hoje
  ou no futuro; a operação roda em transação (atualiza contrato + apaga só
  as faturas de aluguel `PENDENTE` afetadas) e regenera as parcelas fora da
  transação, sem tocar em faturas de IPTU ou já pagas/vencidas.
  Aditivos **não** editam o contrato livremente — é sempre um registro
  auditável (`Aditivo`) com `criadoPor` e `motivo` opcional.
  - **Renovação de contrato não contorna a auditoria**: o contrato antigo é
  soft-deletado e marcado `ENCERRADO`, mas o imóvel **não** é liberado (evita
  uma janela em que o imóvel aparenta estar `DISPONIVEL` durante a
  renovação); a renovação deliberadamente pula a checagem de sobreposição de
  datas do imóvel (é uma continuidade do mesmo contrato, não um novo aluguel
  concorrente).
- **Dinheiro em centavos (inteiro)**: eliminado o `Float` para todo valor
  monetário no schema — a conversão reais↔centavos acontece só na borda HTTP
  (`src/lib/dinheiro.ts`); serviços e cálculos internos operam sobre
  inteiros, sem os erros de arredondamento binário do `Float`.
- **Envio de e-mail de cobrança**: usa SMTP autenticado via `nodemailer`;
  sem as variáveis `SMTP_*` configuradas, o endpoint responde com um aviso
  de "não configurado" em vez de tentar enviar ou falhar silenciosamente —
  nunca loga a senha SMTP.

## Hardening HTTP

- `helmet()` — cabeçalhos de segurança (HSTS, X-Frame-Options,
  X-Content-Type-Options, etc.).
- `x-powered-by` desabilitado.
- CORS restrito à lista em `CORS_ORIGIN` (nunca `*`).
- Limite de corpo de requisição em 100kb (`entity.too.large` → 413).
- Rate limiting: 300 req/15min por IP em toda a API, 30 req/15min no endpoint
  de pagamentos (alvo mais sensível a abuso).

## Configuração

- `API_KEY` e `JWT_SECRET` obrigatórias (mínimo 32 chars) e validadas com
  `zod` na subida — o processo encerra com erro claro se faltar, em vez de
  rodar inseguro.
- Segredos ficam só em `.env` (git-ignorado). Gere as chaves com
  `openssl rand -hex 32`.
- Configuração de SMTP (`SMTP_HOST/PORT/USER/PASS/FROM`) é opcional; sem ela
  o envio de cobrança fica em modo stub, nunca falha por falta de credencial.

## Limitações conhecidas (fora do escopo atual)

- SQLite em dev não tem criptografia em repouso; em produção, usar Postgres
  com disco criptografado (fora do escopo atual — ambiente é só local/dev).
- `npm audit` está limpo (0 vulnerabilidades) na última checagem.
