-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'OPERADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inquilino" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "scoring" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Inquilino_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fiador" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Fiador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Imovel" (
    "id" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "valorPadrao" INTEGER NOT NULL,
    "valorIptuMensal" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DISPONIVEL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Imovel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrato" (
    "id" TEXT NOT NULL,
    "inquilinoId" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "fiadorId" TEXT,
    "valorAluguel" INTEGER NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "percentualMulta" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "taxaJurosDiaria" DOUBLE PRECISION NOT NULL DEFAULT 0.033,
    "tipoGarantia" TEXT NOT NULL,
    "valorCaucao" INTEGER,
    "responsavelIptu" TEXT NOT NULL DEFAULT 'INQUILINO',
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "renovadoDeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aditivo" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "dataVigencia" TIMESTAMP(3) NOT NULL,
    "novoValorAluguel" INTEGER,
    "novoDiaVencimento" INTEGER,
    "motivo" TEXT,
    "criadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Aditivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fatura" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ALUGUEL',
    "valorOriginal" INTEGER NOT NULL,
    "valorMulta" INTEGER NOT NULL DEFAULT 0,
    "valorJuros" INTEGER NOT NULL DEFAULT 0,
    "valorTotal" INTEGER NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "faturaId" TEXT NOT NULL,
    "valorPago" INTEGER NOT NULL,
    "dataPagamento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metodo" TEXT NOT NULL,
    "registradoPor" TEXT NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditoriaPagamento" (
    "id" TEXT NOT NULL,
    "faturaId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "detalhes" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditoriaPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogAtividade" (
    "id" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "detalhes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogAtividade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Inquilino_cpf_key" ON "Inquilino"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "Inquilino_email_key" ON "Inquilino"("email");

-- CreateIndex
CREATE INDEX "Inquilino_deletedAt_idx" ON "Inquilino"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Fiador_cpf_key" ON "Fiador"("cpf");

-- CreateIndex
CREATE INDEX "Fiador_deletedAt_idx" ON "Fiador"("deletedAt");

-- CreateIndex
CREATE INDEX "Imovel_status_idx" ON "Imovel"("status");

-- CreateIndex
CREATE INDEX "Imovel_deletedAt_idx" ON "Imovel"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contrato_renovadoDeId_key" ON "Contrato"("renovadoDeId");

-- CreateIndex
CREATE INDEX "Contrato_inquilinoId_idx" ON "Contrato"("inquilinoId");

-- CreateIndex
CREATE INDEX "Contrato_imovelId_idx" ON "Contrato"("imovelId");

-- CreateIndex
CREATE INDEX "Contrato_fiadorId_idx" ON "Contrato"("fiadorId");

-- CreateIndex
CREATE INDEX "Contrato_status_idx" ON "Contrato"("status");

-- CreateIndex
CREATE INDEX "Contrato_deletedAt_idx" ON "Contrato"("deletedAt");

-- CreateIndex
CREATE INDEX "Aditivo_contratoId_idx" ON "Aditivo"("contratoId");

-- CreateIndex
CREATE INDEX "Fatura_status_idx" ON "Fatura"("status");

-- CreateIndex
CREATE INDEX "Fatura_dataVencimento_idx" ON "Fatura"("dataVencimento");

-- CreateIndex
CREATE INDEX "Fatura_tipo_idx" ON "Fatura"("tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_contratoId_competencia_tipo_key" ON "Fatura"("contratoId", "competencia", "tipo");

-- CreateIndex
CREATE INDEX "Pagamento_faturaId_idx" ON "Pagamento"("faturaId");

-- CreateIndex
CREATE INDEX "AuditoriaPagamento_faturaId_idx" ON "AuditoriaPagamento"("faturaId");

-- CreateIndex
CREATE INDEX "LogAtividade_entidade_entidadeId_idx" ON "LogAtividade"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "LogAtividade_createdAt_idx" ON "LogAtividade"("createdAt");

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_inquilinoId_fkey" FOREIGN KEY ("inquilinoId") REFERENCES "Inquilino"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_fiadorId_fkey" FOREIGN KEY ("fiadorId") REFERENCES "Fiador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrato" ADD CONSTRAINT "Contrato_renovadoDeId_fkey" FOREIGN KEY ("renovadoDeId") REFERENCES "Contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aditivo" ADD CONSTRAINT "Aditivo_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Fatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

