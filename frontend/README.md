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
cp .env.example .env
npm run dev
```

No `.env` que você acabou de criar, edite `VITE_API_KEY` com o **mesmo valor**
de `API_KEY` do `.env` da raiz do backend (ver README raiz), e ajuste
`VITE_API_URL` se o back-end não estiver em `localhost:3000`.

Certifique-se de que o back-end (`../`) está rodando e que `CORS_ORIGIN` no
`.env` dele inclui `http://localhost:5173`.

A tela de login pede só **email e senha** — a API Key fica embutida no build
do frontend (`VITE_API_KEY`), sem aparecer na tela. Isso significa que ela é
visível para quem abrir o DevTools do navegador (não é mais "secreta" nesse
sentido); é uma troca aceitável aqui porque o app roda localmente entre vocês
dois, mas não é o padrão recomendado para uma aplicação exposta na internet.

Para logar você precisa de um usuário cadastrado. O primeiro é criado assim
(rode uma vez, com a API rodando):

```bash
curl -X POST http://localhost:3000/api/auth/registrar-primeiro-admin \
  -H "x-api-key: SUA_API_KEY" -H "Content-Type: application/json" \
  -d '{"nome":"Seu Nome","email":"voce@email.com","senha":"uma-senha-com-8-ou-mais-caracteres"}'
```

Esse endpoint só funciona uma vez (enquanto não existir nenhum usuário no
banco). Detalhes de RBAC/JWT em `SECURITY.md`/`README.md` na raiz do projeto.

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
