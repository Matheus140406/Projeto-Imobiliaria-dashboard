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

Node.js + TypeScript + Express 5 + Prisma (SQLite em dev) + Zod + Vitest.

## Módulos

### Cadastros (Edu)

- CRUD de **Inquilino** (CPF validado por dígito verificador, único; email
  único), **Fiador** (CPF único, flag `ativo`), **Imóvel** (`DISPONIVEL` /
  `ALUGADO` / `MANUTENCAO`) e **Contrato**.
- **Garantia obrigatória**: contrato só é criado se `caução ≥ 3x o aluguel`
  **ou** houver um fiador ativo vinculado.
- **Geração automática de parcelas**: ao criar o contrato, uma fatura por mês
  de vigência já é criada (reaproveitando o motor de faturas do Matheus).
- **Soft delete em tudo**: excluir inquilino/fiador/imóvel/contrato nunca
  apaga o histórico — só marca `deletedAt` e some das listagens.
- Imóvel muda de status automaticamente: `DISPONIVEL → ALUGADO` ao fechar
  contrato, `ALUGADO → DISPONIVEL` ao encerrar.

### Financeiro + Dashboard (Matheus)

- Geração automática de fatura por contrato/competência.
- Cálculo de multa (% contratual) + juros (taxa diária) sobre faturas em
  atraso.
- Cron noturno (00:10) que marca `ATRASADO` toda fatura cujo vencimento + 1
  dia já ficou no passado (a partir do 2º dia corrido de atraso).
- Registro de pagamento manual com auditoria (`AuditoriaPagamento`) e ajuste
  de scoring do inquilino (usa a data real do pagamento, não um status que
  pode estar desatualizado).
- Dashboard com filtros (competência/imóvel/inquilino): receitas,
  inadimplência, a receber, contratos vencendo, faturas atrasadas na última
  noite, status semanal/mensal por inquilino e um resumo para ação rápida.

## Integração entre as partes

- Edu cria o **Contrato** → Matheus gera a **Fatura** automaticamente (1 por
  mês da vigência).
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

44 testes automatizados (unitários + integração com SQLite + HTTP via
supertest), cobrindo: cálculo de multa/juros, geração/idempotência de
faturas, pagamento parcial rejeitado, scoring com status desatualizado,
concorrência, regra de garantia, disponibilidade de imóvel, geração de
parcelas, soft delete, autenticação e não vazamento de erros internos.

## Endpoints principais

### Cadastros

- `POST /api/inquilinos`, `GET /api/inquilinos`, `DELETE /api/inquilinos/:id`
- `POST /api/fiadores`, `GET /api/fiadores`, `GET /api/fiadores/:id`, `DELETE /api/fiadores/:id`
- `POST /api/imoveis`, `GET /api/imoveis?disponiveis=true`, `GET /api/imoveis/:id`, `DELETE /api/imoveis/:id`
- `POST /api/contratos`, `GET /api/contratos`, `GET /api/contratos/:id`
- `GET /api/contratos/:id/parcelas` — histórico de parcelas do contrato
- `POST /api/contratos/:id/encerrar` — soft delete + libera o imóvel

### Financeiro

- `POST /api/faturas/gerar/:contratoId`
- `POST /api/faturas/gerar-mes`
- `POST /api/faturas/marcar-atrasadas`
- `POST /api/faturas/:faturaId/pagamentos`

### Dashboard

- `GET /api/dashboard/receitas`
- `GET /api/dashboard/inadimplencia`
- `GET /api/dashboard/a-receber`
- `GET /api/dashboard/contratos-vencendo`
- `GET /api/dashboard/faturas-atrasadas-recentemente`
- `GET /api/dashboard/resumo`
- `GET /api/dashboard/inquilinos/:inquilinoId/status-periodo?granularidade=semana|mes`

Todas as rotas exigem o header `x-api-key`. Detalhes de segurança em
[`SECURITY.md`](./SECURITY.md).
