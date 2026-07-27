# Financeiro + Dashboard — Imobiliária

Módulo de faturas, pagamentos e indicadores financeiros para o dashboard de gestão imobiliária.

## Stack

Node.js + TypeScript + Express + Prisma (SQLite em dev).

## Funcionalidades

- **Geração automática de fatura** por contrato/competência (`gerarFaturaMensal`, `gerarFaturasDoMes`).
- **Cálculo de multa (% contratual) + juros (taxa diária)** sobre faturas em atraso (`calcularMultaEJuros`).
- **Cron noturno** (`00:10`) que marca como `ATRASADO` toda fatura cujo vencimento + 1 dia já passou, recalculando multa/juros.
- **Registro de pagamento manual** com auditoria (`AuditoriaPagamento`) e ajuste de scoring do inquilino.
- **Dashboard**: receitas, inadimplência, a receber, contratos vencendo, faturas atrasadas na última noite e resumo para ação rápida — todos com filtros por competência/imóvel/inquilino.

## Rodando localmente

```bash
npm install
cp .env.example .env
npm run prisma:migrate
npm run dev
```

## Testes

```bash
npm test
```

## Endpoints principais

- `POST /api/faturas/gerar/:contratoId`
- `POST /api/faturas/gerar-mes`
- `POST /api/faturas/marcar-atrasadas`
- `POST /api/faturas/:faturaId/pagamentos`
- `GET /api/dashboard/receitas`
- `GET /api/dashboard/inadimplencia`
- `GET /api/dashboard/a-receber`
- `GET /api/dashboard/contratos-vencendo`
- `GET /api/dashboard/faturas-atrasadas-recentemente`
- `GET /api/dashboard/resumo`
