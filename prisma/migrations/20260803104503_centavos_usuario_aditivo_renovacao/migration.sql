/*
  Warnings:

  - You are about to alter the column `valorAluguel` on the `Contrato` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `valorCaucao` on the `Contrato` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `valorJuros` on the `Fatura` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `valorMulta` on the `Fatura` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `valorOriginal` on the `Fatura` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `valorTotal` on the `Fatura` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `valorIptuMensal` on the `Imovel` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `valorPadrao` on the `Imovel` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `valorPago` on the `Pagamento` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.

*/
-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'OPERADOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Aditivo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contratoId" TEXT NOT NULL,
    "dataVigencia" DATETIME NOT NULL,
    "novoValorAluguel" INTEGER,
    "novoDiaVencimento" INTEGER,
    "motivo" TEXT,
    "criadoPor" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Aditivo_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contrato" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inquilinoId" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "fiadorId" TEXT,
    "valorAluguel" INTEGER NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "percentualMulta" REAL NOT NULL DEFAULT 2,
    "taxaJurosDiaria" REAL NOT NULL DEFAULT 0.033,
    "tipoGarantia" TEXT NOT NULL,
    "valorCaucao" INTEGER,
    "responsavelIptu" TEXT NOT NULL DEFAULT 'INQUILINO',
    "dataInicio" DATETIME NOT NULL,
    "dataFim" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "renovadoDeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Contrato_inquilinoId_fkey" FOREIGN KEY ("inquilinoId") REFERENCES "Inquilino" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contrato_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contrato_fiadorId_fkey" FOREIGN KEY ("fiadorId") REFERENCES "Fiador" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Contrato_renovadoDeId_fkey" FOREIGN KEY ("renovadoDeId") REFERENCES "Contrato" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Contrato" ("createdAt", "dataFim", "dataInicio", "deletedAt", "diaVencimento", "fiadorId", "id", "imovelId", "inquilinoId", "percentualMulta", "responsavelIptu", "status", "taxaJurosDiaria", "tipoGarantia", "updatedAt", "valorAluguel", "valorCaucao") SELECT "createdAt", "dataFim", "dataInicio", "deletedAt", "diaVencimento", "fiadorId", "id", "imovelId", "inquilinoId", "percentualMulta", "responsavelIptu", "status", "taxaJurosDiaria", "tipoGarantia", "updatedAt", "valorAluguel", "valorCaucao" FROM "Contrato";
DROP TABLE "Contrato";
ALTER TABLE "new_Contrato" RENAME TO "Contrato";
CREATE UNIQUE INDEX "Contrato_renovadoDeId_key" ON "Contrato"("renovadoDeId");
CREATE INDEX "Contrato_inquilinoId_idx" ON "Contrato"("inquilinoId");
CREATE INDEX "Contrato_imovelId_idx" ON "Contrato"("imovelId");
CREATE INDEX "Contrato_fiadorId_idx" ON "Contrato"("fiadorId");
CREATE INDEX "Contrato_status_idx" ON "Contrato"("status");
CREATE INDEX "Contrato_deletedAt_idx" ON "Contrato"("deletedAt");
CREATE TABLE "new_Fatura" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contratoId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'ALUGUEL',
    "valorOriginal" INTEGER NOT NULL,
    "valorMulta" INTEGER NOT NULL DEFAULT 0,
    "valorJuros" INTEGER NOT NULL DEFAULT 0,
    "valorTotal" INTEGER NOT NULL,
    "dataVencimento" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fatura_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Fatura" ("competencia", "contratoId", "createdAt", "dataVencimento", "id", "status", "tipo", "updatedAt", "valorJuros", "valorMulta", "valorOriginal", "valorTotal") SELECT "competencia", "contratoId", "createdAt", "dataVencimento", "id", "status", "tipo", "updatedAt", "valorJuros", "valorMulta", "valorOriginal", "valorTotal" FROM "Fatura";
DROP TABLE "Fatura";
ALTER TABLE "new_Fatura" RENAME TO "Fatura";
CREATE INDEX "Fatura_status_idx" ON "Fatura"("status");
CREATE INDEX "Fatura_dataVencimento_idx" ON "Fatura"("dataVencimento");
CREATE INDEX "Fatura_tipo_idx" ON "Fatura"("tipo");
CREATE UNIQUE INDEX "Fatura_contratoId_competencia_tipo_key" ON "Fatura"("contratoId", "competencia", "tipo");
CREATE TABLE "new_Imovel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endereco" TEXT NOT NULL,
    "valorPadrao" INTEGER NOT NULL,
    "valorIptuMensal" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DISPONIVEL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_Imovel" ("createdAt", "deletedAt", "endereco", "id", "status", "updatedAt", "valorIptuMensal", "valorPadrao") SELECT "createdAt", "deletedAt", "endereco", "id", "status", "updatedAt", "valorIptuMensal", "valorPadrao" FROM "Imovel";
DROP TABLE "Imovel";
ALTER TABLE "new_Imovel" RENAME TO "Imovel";
CREATE INDEX "Imovel_status_idx" ON "Imovel"("status");
CREATE INDEX "Imovel_deletedAt_idx" ON "Imovel"("deletedAt");
CREATE TABLE "new_Pagamento" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "faturaId" TEXT NOT NULL,
    "valorPago" INTEGER NOT NULL,
    "dataPagamento" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metodo" TEXT NOT NULL,
    "registradoPor" TEXT NOT NULL,
    "observacao" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Pagamento_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Fatura" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Pagamento" ("createdAt", "dataPagamento", "faturaId", "id", "metodo", "observacao", "registradoPor", "valorPago") SELECT "createdAt", "dataPagamento", "faturaId", "id", "metodo", "observacao", "registradoPor", "valorPago" FROM "Pagamento";
DROP TABLE "Pagamento";
ALTER TABLE "new_Pagamento" RENAME TO "Pagamento";
CREATE INDEX "Pagamento_faturaId_idx" ON "Pagamento"("faturaId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE INDEX "Aditivo_contratoId_idx" ON "Aditivo"("contratoId");
