-- AlterTable
ALTER TABLE "Imovel" ADD COLUMN "valorIptuMensal" REAL;

-- CreateTable
CREATE TABLE "LogAtividade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entidade" TEXT NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "acao" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "detalhes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contrato" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inquilinoId" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "fiadorId" TEXT,
    "valorAluguel" REAL NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "percentualMulta" REAL NOT NULL DEFAULT 2,
    "taxaJurosDiaria" REAL NOT NULL DEFAULT 0.033,
    "tipoGarantia" TEXT NOT NULL,
    "valorCaucao" REAL,
    "responsavelIptu" TEXT NOT NULL DEFAULT 'INQUILINO',
    "dataInicio" DATETIME NOT NULL,
    "dataFim" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Contrato_inquilinoId_fkey" FOREIGN KEY ("inquilinoId") REFERENCES "Inquilino" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contrato_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "Imovel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Contrato_fiadorId_fkey" FOREIGN KEY ("fiadorId") REFERENCES "Fiador" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Contrato" ("createdAt", "dataFim", "dataInicio", "deletedAt", "diaVencimento", "fiadorId", "id", "imovelId", "inquilinoId", "percentualMulta", "status", "taxaJurosDiaria", "tipoGarantia", "updatedAt", "valorAluguel", "valorCaucao") SELECT "createdAt", "dataFim", "dataInicio", "deletedAt", "diaVencimento", "fiadorId", "id", "imovelId", "inquilinoId", "percentualMulta", "status", "taxaJurosDiaria", "tipoGarantia", "updatedAt", "valorAluguel", "valorCaucao" FROM "Contrato";
DROP TABLE "Contrato";
ALTER TABLE "new_Contrato" RENAME TO "Contrato";
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
    "valorOriginal" REAL NOT NULL,
    "valorMulta" REAL NOT NULL DEFAULT 0,
    "valorJuros" REAL NOT NULL DEFAULT 0,
    "valorTotal" REAL NOT NULL,
    "dataVencimento" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Fatura_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "Contrato" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Fatura" ("competencia", "contratoId", "createdAt", "dataVencimento", "id", "status", "updatedAt", "valorJuros", "valorMulta", "valorOriginal", "valorTotal") SELECT "competencia", "contratoId", "createdAt", "dataVencimento", "id", "status", "updatedAt", "valorJuros", "valorMulta", "valorOriginal", "valorTotal" FROM "Fatura";
DROP TABLE "Fatura";
ALTER TABLE "new_Fatura" RENAME TO "Fatura";
CREATE INDEX "Fatura_status_idx" ON "Fatura"("status");
CREATE INDEX "Fatura_dataVencimento_idx" ON "Fatura"("dataVencimento");
CREATE INDEX "Fatura_tipo_idx" ON "Fatura"("tipo");
CREATE UNIQUE INDEX "Fatura_contratoId_competencia_tipo_key" ON "Fatura"("contratoId", "competencia", "tipo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LogAtividade_entidade_entidadeId_idx" ON "LogAtividade"("entidade", "entidadeId");

-- CreateIndex
CREATE INDEX "LogAtividade_createdAt_idx" ON "LogAtividade"("createdAt");
