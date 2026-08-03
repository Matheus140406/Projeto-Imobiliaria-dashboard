# Imobiliária Dashboard — Projeto em Dupla (fins de aprendizado)

Projeto de estudo desenvolvido em dupla, dividido por módulos:

- **Matheus ([@Matheus140406](https://github.com/Matheus140406))** — Financeiro + Dashboard: faturas, multa/juros,
  pagamentos, cron de inadimplência, indicadores e segurança da API.
- **Edu ([@Eduardovilanova](https://github.com/Eduardovilanova))** — Cadastros + Contratos: inquilino, imóvel,
  fiador, contrato, regra de garantia e geração automática de parcelas.

As duas partes foram unificadas neste repositório num back-end único
(Node.js + TypeScript + Express + Prisma), com o schema do banco reconciliado
e a API mesclada sob o mesmo servidor.

## Stack

Node.js + TypeScript + Express 5 + Prisma (SQLite em dev) + Zod + Vitest + PDFKit.

## Módulos

### Cadastros (Edu)

- CRUD (criar/listar/editar/excluir) de **Inquilino** (CPF validado por
  dígito verificador, único; email único), **Fiador** (CPF único, flag
  `ativo`), **Imóvel** (`DISPONIVEL` / `ALUGADO` / `MANUTENCAO`) e
  **Contrato**.
- **Garantia obrigatória**: contrato só é criado se `caução ≥ 3x o aluguel`
  **ou** houver um fiador ativo vinculado.
- **Geração automática de parcelas**: ao criar o contrato, uma fatura por mês
  de vigência já é criada (reaproveitando o motor de faturas do Matheus).
- **IPTU**: se o imóvel tiver `valorIptuMensal` cadastrado e o contrato
  atribuir a responsabilidade ao inquilino (`responsavelIptu: "INQUILINO"`,
  padrão), uma fatura de IPTU é gerada lado a lado com a de aluguel todo mês
  — dá pra ver separadamente se o inquilino está em dia com o IPTU.
- **Gerador de contrato profissional**: monta o contrato de locação a partir
  dos dados cadastrados, com dicas do que falta/é recomendado preencher, e
  permite baixar em **texto** ou **PDF**.
- **Validação de sobreposição de datas**: além de exigir o imóvel
  `DISPONIVEL`, bloqueia criar um contrato ativo cujo período conflite com
  outro já existente para o mesmo imóvel.
- **Soft delete em tudo**: excluir inquilino/fiador/imóvel/contrato nunca
  apaga o histórico — só marca `deletedAt` e some das listagens.
- Imóvel muda de status automaticamente: `DISPONIVEL → ALUGADO` ao fechar
  contrato, `ALUGADO → DISPONIVEL` ao encerrar.
- **Log de atividade**: toda criação/edição/exclusão de cadastro fica
  registrada (quem fez, o quê e quando) em `/api/log-atividade`.

### Financeiro + Dashboard (Matheus)

- Geração automática de fatura (aluguel e IPTU) por contrato/competência.
- Cálculo de multa (% contratual) + juros (taxa diária) sobre faturas em
  atraso — com endpoint de detalhe que mostra o cálculo transparente mesmo
  antes do cron da madrugada rodar.
- Cron noturno (00:10) que marca `ATRASADO` toda fatura cujo vencimento + 1
  dia já ficou no passado (a partir do 2º dia corrido de atraso).
- Registro de pagamento manual com auditoria (`AuditoriaPagamento`) e ajuste
  de scoring do inquilino (usa a data real do pagamento, não um status que
  pode estar desatualizado).
- Dashboard com filtros (competência/imóvel/inquilino): receitas,
  inadimplência, a receber (com janela de dias, ex. "próximos 7 dias"),
  contratos vencendo, faturas atrasadas na última noite, status
  semanal/mensal por inquilino, listagem geral de faturas e um resumo para
  ação rápida (incluindo "reenviar cobrança").

## Integração entre as partes

- Edu cria o **Contrato** → Matheus gera a **Fatura** automaticamente (1 por
  mês da vigência, aluguel + IPTU quando aplicável).
- Matheus registra o **Pagamento** → o **scoring** do inquilino (consumido
  pelo cadastro do Edu) é ajustado.
- O **status do imóvel** (Edu) reflete o ciclo de vida do contrato
  (Financeiro/Matheus não mexe nele diretamente, só lê).

## Rodando localmente

```bash
npm install
cp .env.example .env   # gere a API_KEY com: openssl rand -hex 32
npm run prisma:migrate
npm run dev
```

## Testes

```bash
npm test
```

58 testes automatizados (unitários + integração com SQLite + HTTP via
supertest), cobrindo: cálculo de multa/juros, geração/idempotência de
faturas, pagamento parcial rejeitado, scoring com status desatualizado,
concorrência, regra de garantia, disponibilidade de imóvel, sobreposição de
datas, geração de parcelas (aluguel + IPTU), edição de cadastros, log de
atividade, gerador de contrato (texto/PDF), soft delete, autenticação e não
vazamento de erros internos.

CI no GitHub Actions (`.github/workflows/ci.yml`) roda type check, testes e
build a cada push/PR.

## Endpoints principais

### Cadastros

- `POST/GET/PUT/DELETE /api/inquilinos[/:id]`
- `POST/GET/PUT/DELETE /api/fiadores[/:id]` — a ficha do fiador (`GET /:id`)
  já traz os contratos que ele garante
- `POST/GET/PUT/DELETE /api/imoveis[/:id]` — a ficha do imóvel (`GET /:id`)
  já traz o contrato ativo, se houver
- `POST /api/contratos`, `GET /api/contratos`, `GET /api/contratos/:id`
- `GET /api/contratos/:id/parcelas` — histórico de parcelas do contrato
- `POST /api/contratos/:id/encerrar` — soft delete + libera o imóvel
- `GET /api/contratos/:id/documento/avisos` — dicas do que falta/é recomendado
- `GET /api/contratos/:id/documento?formato=pdf|texto` — baixa o contrato

### Financeiro

- `GET /api/faturas` — listagem geral com filtros (status, competência, imóvel/inquilino)
- `GET /api/faturas/:id` — detalhe com cálculo de multa/juros ao vivo
- `POST /api/faturas/gerar/:contratoId`
- `POST /api/faturas/gerar-mes`
- `POST /api/faturas/marcar-atrasadas`
- `POST /api/faturas/:faturaId/pagamentos`
- `POST /api/faturas/:id/reenviar-cobranca` — ação rápida (stub; envio real ainda não integrado)

### Dashboard

- `GET /api/dashboard/receitas`
- `GET /api/dashboard/inadimplencia`
- `GET /api/dashboard/a-receber?dias=7`
- `GET /api/dashboard/contratos-vencendo`
- `GET /api/dashboard/faturas-atrasadas-recentemente`
- `GET /api/dashboard/resumo`
- `GET /api/dashboard/inquilinos/:inquilinoId/status-periodo?granularidade=semana|mes`
- `GET /api/log-atividade?entidade=Contrato&entidadeId=...`

Todas as rotas exigem o header `x-api-key`. Detalhes de segurança em
[`SECURITY.md`](./SECURITY.md).
