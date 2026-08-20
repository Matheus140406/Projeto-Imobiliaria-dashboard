-- Ajusta os defaults de multa/juros do contrato (10% + 0,5% ao dia, antes 2% + 0,033% ao dia)
-- e adiciona índices usados pelos padrões de consulta de dashboard, relatórios,
-- exclusão/encerramento de contrato e aditivo contratual.

ALTER TABLE "Contrato" ALTER COLUMN "percentualMulta" SET DEFAULT 10;
ALTER TABLE "Contrato" ALTER COLUMN "taxaJurosDiaria" SET DEFAULT 0.5;

CREATE INDEX "Contrato_dataFim_idx" ON "Contrato"("dataFim");

CREATE INDEX "Fatura_competencia_idx" ON "Fatura"("competencia");
CREATE INDEX "Fatura_contratoId_status_idx" ON "Fatura"("contratoId", "status");
CREATE INDEX "Fatura_status_updatedAt_idx" ON "Fatura"("status", "updatedAt");
