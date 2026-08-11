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
    "percentualMulta" REAL NOT NULL DEFAULT 10,
    "taxaJurosDiaria" REAL NOT NULL DEFAULT 0.5,
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
INSERT INTO "new_Contrato" ("createdAt", "dataFim", "dataInicio", "deletedAt", "diaVencimento", "fiadorId", "id", "imovelId", "inquilinoId", "percentualMulta", "renovadoDeId", "responsavelIptu", "status", "taxaJurosDiaria", "tipoGarantia", "updatedAt", "valorAluguel", "valorCaucao") SELECT "createdAt", "dataFim", "dataInicio", "deletedAt", "diaVencimento", "fiadorId", "id", "imovelId", "inquilinoId", "percentualMulta", "renovadoDeId", "responsavelIptu", "status", "taxaJurosDiaria", "tipoGarantia", "updatedAt", "valorAluguel", "valorCaucao" FROM "Contrato";
DROP TABLE "Contrato";
ALTER TABLE "new_Contrato" RENAME TO "Contrato";
CREATE UNIQUE INDEX "Contrato_renovadoDeId_key" ON "Contrato"("renovadoDeId");
CREATE INDEX "Contrato_inquilinoId_idx" ON "Contrato"("inquilinoId");
CREATE INDEX "Contrato_imovelId_idx" ON "Contrato"("imovelId");
CREATE INDEX "Contrato_fiadorId_idx" ON "Contrato"("fiadorId");
CREATE INDEX "Contrato_status_idx" ON "Contrato"("status");
CREATE INDEX "Contrato_deletedAt_idx" ON "Contrato"("deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
