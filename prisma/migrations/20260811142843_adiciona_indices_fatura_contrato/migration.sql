-- CreateIndex
CREATE INDEX "Contrato_dataFim_idx" ON "Contrato"("dataFim");

-- CreateIndex
CREATE INDEX "Fatura_competencia_idx" ON "Fatura"("competencia");

-- CreateIndex
CREATE INDEX "Fatura_contratoId_status_idx" ON "Fatura"("contratoId", "status");

-- CreateIndex
CREATE INDEX "Fatura_status_updatedAt_idx" ON "Fatura"("status", "updatedAt");
