-- CreateIndex
CREATE INDEX "AuditoriaPagamento_faturaId_idx" ON "AuditoriaPagamento"("faturaId");

-- CreateIndex
CREATE INDEX "Contrato_inquilinoId_idx" ON "Contrato"("inquilinoId");

-- CreateIndex
CREATE INDEX "Contrato_status_idx" ON "Contrato"("status");

-- CreateIndex
CREATE INDEX "Pagamento_faturaId_idx" ON "Pagamento"("faturaId");
