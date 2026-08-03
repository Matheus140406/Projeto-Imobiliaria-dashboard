/*
  Warnings:

  - You are about to drop the column `imovel` on the `Contrato` table. All the data in the column will be lost.
  - Added the required column `imovelId` to the `Contrato` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tipoGarantia` to the `Contrato` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Contrato` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cpf` to the `Inquilino` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Inquilino` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Fiador" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Imovel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "endereco" TEXT NOT NULL,
    "valorPadrao" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISPONIVEL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
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
INSERT INTO "new_Contrato" ("createdAt", "dataFim", "dataInicio", "diaVencimento", "id", "inquilinoId", "percentualMulta", "status", "taxaJurosDiaria", "valorAluguel") SELECT "createdAt", "dataFim", "dataInicio", "diaVencimento", "id", "inquilinoId", "percentualMulta", "status", "taxaJurosDiaria", "valorAluguel" FROM "Contrato";
DROP TABLE "Contrato";
ALTER TABLE "new_Contrato" RENAME TO "Contrato";
CREATE INDEX "Contrato_inquilinoId_idx" ON "Contrato"("inquilinoId");
CREATE INDEX "Contrato_imovelId_idx" ON "Contrato"("imovelId");
CREATE INDEX "Contrato_fiadorId_idx" ON "Contrato"("fiadorId");
CREATE INDEX "Contrato_status_idx" ON "Contrato"("status");
CREATE INDEX "Contrato_deletedAt_idx" ON "Contrato"("deletedAt");
CREATE TABLE "new_Inquilino" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "scoring" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME
);
INSERT INTO "new_Inquilino" ("createdAt", "email", "id", "nome", "scoring", "telefone") SELECT "createdAt", "email", "id", "nome", "scoring", "telefone" FROM "Inquilino";
DROP TABLE "Inquilino";
ALTER TABLE "new_Inquilino" RENAME TO "Inquilino";
CREATE UNIQUE INDEX "Inquilino_cpf_key" ON "Inquilino"("cpf");
CREATE UNIQUE INDEX "Inquilino_email_key" ON "Inquilino"("email");
CREATE INDEX "Inquilino_deletedAt_idx" ON "Inquilino"("deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Fiador_cpf_key" ON "Fiador"("cpf");

-- CreateIndex
CREATE INDEX "Fiador_deletedAt_idx" ON "Fiador"("deletedAt");

-- CreateIndex
CREATE INDEX "Imovel_status_idx" ON "Imovel"("status");

-- CreateIndex
CREATE INDEX "Imovel_deletedAt_idx" ON "Imovel"("deletedAt");
