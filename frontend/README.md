# Frontend — Imobiliária Dashboard

Interface web para o back-end de Financeiro + Cadastros + Contratos. Layout
portado do protótipo feito no Figma Make, com os dados mockados substituídos
por chamadas reais à API.

## Stack

React 19 + TypeScript + Vite + lucide-react. Sem framework de CSS — usa o
mesmo design system do protótipo original (`src/index.css`, variáveis CSS).

## Rodando localmente

```bash
npm install
cp .env.example .env   # ajuste VITE_API_URL se o back-end não estiver em localhost:3000
npm run dev
```

Certifique-se de que o back-end (`../`) está rodando e que `CORS_ORIGIN` no
`.env` dele inclui `http://localhost:5173`.

Ao abrir a aplicação, informe a `x-api-key` do back-end (necessária para toda
chamada à API). Se você tiver um usuário cadastrado, pode também fazer login
com email/senha para liberar ações administrativas (excluir cadastros,
encerrar contrato) — ver `SECURITY.md`/`README.md` na raiz do projeto.

## Telas

- **Dashboard**: KPIs (receitas, inadimplência, a receber, contratos
  vencendo), fila de faturas em atraso com reenvio de cobrança, ações
  rápidas.
- **Financeiro**: listagem de faturas com filtros, detalhe com cálculo de
  multa/juros ao vivo, registro de pagamento.
- **Contratos**: listagem, criação (assistente simplificado) e detalhe com
  histórico de parcelas.
- **Imóveis**: listagem com contadores por status e cadastro de novo imóvel.
- **Cadastros**: inquilinos e fiadores, com cadastro rápido.

## Build

```bash
npm run build
```
