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

Node.js + TypeScript + Express 5 + Prisma (SQLite em dev) + Zod + Vitest + PDFKit +
JWT (`jsonwebtoken` + `bcryptjs`) + Nodemailer.

## Frontend

Interface web em `frontend/` (React + TypeScript + Vite), com o layout
portado de um protótipo feito no Figma Make e conectado às rotas reais desta
API (Dashboard, Financeiro, Contratos, Imóveis, Cadastros). Ver
`frontend/README.md` para rodar localmente.

## Módulos

### Cadastros (Edu)

- CRUD (criar/listar/editar/excluir) de **Inquilino** (CPF validado por
  dígito verificador, único; email único), **Fiador** (CPF único, flag
  `ativo`), **Imóvel** (`DISPONIVEL` / `ALUGADO` / `MANUTENCAO`) e
  **Contrato**.
- **Garantia obrigatória**: contrato só é criado se houver **caução (qualquer
  valor maior que zero — não há piso automático de "3x o aluguel"; é uma
  decisão comercial do usuário)** ou um fiador ativo vinculado.
- **Exclusão de contrato**: exclusão lógica (soft delete), pensada para
  contratos quebrados antes do prazo. Cancela as parcelas ainda pendentes
  (saem de "a receber"), preserva faturas já pagas/atrasadas como histórico e
  libera o imóvel se ele estava ocupado por este contrato. Exige ADMIN
  logado, igual às outras exclusões.
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
- **Aditivo contratual**: em vez de editar o contrato ativo livremente, um
  aditivo registra uma mudança de valor de aluguel e/ou dia de vencimento a
  partir de uma data de vigência futura — só as parcelas de aluguel ainda
  `PENDENTE` a partir dessa data são regeradas com o novo valor; o passado e o
  IPTU não são tocados.
- **Renovação de contrato**: encerra o contrato atual (sem liberar o imóvel)
  e cria um novo, vinculado ao anterior (`renovadoDeId`), começando no dia
  seguinte ao fim do contrato antigo, com novas parcelas geradas — usado para
  continuar a locação com o mesmo inquilino/imóvel sem passar pelas
  checagens de disponibilidade de um contrato novo e não relacionado.

### Financeiro + Dashboard (Matheus)

- Geração automática de fatura (aluguel e IPTU) por contrato/competência.
- Cálculo de multa (% contratual, padrão **10%**) + juros de mora (% ao dia,
  padrão **0,5% ao dia**) sobre faturas em atraso — ambos incidem sobre o
  **valor original** da parcela (nunca sobre a própria multa ou sobre juros já
  acumulados), e a multa é fixa (não dobra a cada dia — só os juros crescem
  com os dias de atraso). Percentuais são configuráveis por contrato. Endpoint
  de detalhe mostra o cálculo transparente mesmo antes do cron da madrugada
  rodar.
- Cron noturno (00:10) que marca `ATRASADO` toda fatura cujo vencimento + 1
  dia já ficou no passado (a partir do 2º dia corrido de atraso).
- Registro de pagamento manual com auditoria (`AuditoriaPagamento`) e ajuste
  de scoring do inquilino (usa a data real do pagamento, não um status que
  pode estar desatualizado).
- Dashboard com filtros (competência/imóvel/inquilino): receitas,
  inadimplência, a receber (com janela de dias, ex. "próximos 7 dias"),
  contratos vencendo, faturas atrasadas na última noite, status
  semanal/mensal por inquilino, listagem geral de faturas e um resumo para
  ação rápida (incluindo "reenviar cobrança", que envia um e-mail real via
  SMTP quando configurado, com fallback para um aviso de "não configurado").
- **Exportação de relatórios em CSV**: listagem de faturas filtrável, pronta
  para abrir em planilha.

## Dinheiro é armazenado em centavos (inteiro)

Todo valor monetário no banco (`valorAluguel`, `valorTotal`, `valorPago`
etc.) é um **inteiro em centavos**, não `Float` em reais — evita os erros de
arredondamento de ponto flutuante que `Float` traz para dinheiro. A conversão
acontece só na borda HTTP (`src/routes.ts`): a API **recebe e devolve reais**
(ex. `1200.50`) normalmente; internamente tudo é `120050`. Ver
`src/lib/dinheiro.ts` para as funções de conversão — qualquer novo campo
monetário precisa ser adicionado à lista `CAMPOS_MONETARIOS` de lá para ser
convertido corretamente na resposta.

## Autenticação e papéis (RBAC)

Além da `x-api-key` (que continua sendo o portão de rede da API inteira),
agora existe um sistema de usuários leve com login e papéis:

- `POST /api/auth/registrar-primeiro-admin` — cria o primeiro usuário
  (sempre `ADMIN`); só funciona enquanto não existir nenhum usuário no banco.
- `POST /api/auth/login` — retorna um JWT (`Authorization: Bearer <token>`,
  válido por 12h).
- `POST /api/usuarios` — cria novos usuários (`ADMIN` ou `OPERADOR`); exige
  estar logado como `ADMIN`.
- Ações destrutivas (excluir inquilino/fiador/imóvel, encerrar contrato)
  exigem um `ADMIN` logado (JWT), não só a API key.
- Ações de rotina (criar/editar cadastro, registrar pagamento, aditivo,
  renovação) continuam exigindo apenas a `x-api-key`.

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
cp .env.example .env   # gere API_KEY e JWT_SECRET com: openssl rand -hex 32
npm run prisma:migrate
npm run dev
```

Para envio real de e-mail de cobrança, preencha `SMTP_HOST`/`SMTP_PORT`/
`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` no `.env`; sem isso, o endpoint de
reenvio de cobrança responde com um aviso de "envio não configurado" em vez
de falhar.

## Testes

```bash
npm test
```

91 testes automatizados (unitários + integração com SQLite + HTTP via
supertest), cobrindo: cálculo de multa/juros (em centavos), geração/
idempotência de faturas, pagamento parcial rejeitado, pagamento concorrente
(só um vence a corrida), scoring com status desatualizado, concorrência,
regra de garantia, disponibilidade de imóvel, sobreposição de datas, geração
de parcelas (aluguel + IPTU), edição de cadastros, exclusão com bloqueio por
contrato ativo, log de atividade, gerador de contrato (texto/PDF), soft
delete, autenticação, RBAC (rota de renovação exige ADMIN), CSV injection,
conversão reais↔centavos, aditivo contratual, renovação de
contrato e não vazamento de erros internos.

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
- `POST /api/contratos/:id/encerrar` — soft delete + libera o imóvel (exige ADMIN logado)
- `DELETE /api/contratos/:id` — exclusão lógica do contrato (ex.: quebrado antes do
  prazo); cancela parcelas ainda pendentes, preserva as já pagas/atrasadas como
  histórico, libera o imóvel (exige ADMIN logado)
- `POST /api/contratos/:id/aditivos` — registra aditivo (novo valor/vencimento a partir de uma data)
- `GET /api/contratos/:id/aditivos` — histórico de aditivos do contrato
- `POST /api/contratos/:id/renovar` — renova o contrato (encerra o atual, cria um novo vinculado; exige ADMIN logado)
- `GET /api/contratos/:id/documento/avisos` — dicas do que falta/é recomendado
- `GET /api/contratos/:id/documento?formato=pdf|texto` — baixa o contrato

### Autenticação

- `POST /api/auth/registrar-primeiro-admin`
- `POST /api/auth/login`
- `POST /api/usuarios` (exige ADMIN logado)

### Financeiro

- `GET /api/faturas` — listagem geral com filtros (status, competência, imóvel/inquilino)
- `GET /api/faturas/:id` — detalhe com cálculo de multa/juros ao vivo
- `POST /api/faturas/gerar/:contratoId`
- `POST /api/faturas/gerar-mes`
- `POST /api/faturas/marcar-atrasadas`
- `POST /api/faturas/:faturaId/pagamentos`
- `POST /api/faturas/:id/reenviar-cobranca` — envia e-mail real se SMTP estiver configurado
- `GET /api/relatorios/faturas.csv` — exporta faturas filtradas em CSV

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
