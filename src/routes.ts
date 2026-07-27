import { Router } from "express";
import { z } from "zod";
import { prisma } from "./lib/prisma";
import { gerarFaturaMensal, gerarFaturasDoMes, marcarFaturasAtrasadas } from "./financeiro/faturaService";
import { registrarPagamento } from "./financeiro/pagamentoService";
import {
  aReceber,
  contratosVencendo,
  faturasAtrasadasRecentemente,
  inadimplencia,
  receitas,
  resumoAcaoRapida,
  statusPorPeriodoInquilino,
} from "./dashboard/dashboardService";

export const router = Router();

const idSchema = z.string().min(1).max(64);

const filtroSchema = z.object({
  competenciaInicio: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  competenciaFim: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  imovel: z.string().max(200).optional(),
  inquilinoId: idSchema.optional(),
});

// Express 5 encaminha automaticamente rejeições de Promise (inclusive de z.parse) para o
// middleware de erro central — não é necessário try/catch em cada rota.

router.post("/faturas/gerar/:contratoId", async (req, res) => {
  const contratoId = idSchema.parse(req.params.contratoId);
  const fatura = await gerarFaturaMensal(prisma, contratoId);
  res.status(201).json(fatura);
});

router.post("/faturas/gerar-mes", async (_req, res) => {
  const resultado = await gerarFaturasDoMes(prisma);
  res.status(201).json(resultado);
});

router.post("/faturas/marcar-atrasadas", async (_req, res) => {
  const atualizadas = await marcarFaturasAtrasadas(prisma);
  res.json(atualizadas);
});

const METODOS_PAGAMENTO = ["PIX", "BOLETO", "DINHEIRO", "CARTAO", "TRANSFERENCIA"] as const;

const pagamentoSchema = z.object({
  valorPago: z.number().positive().finite().max(1_000_000_000),
  metodo: z.enum(METODOS_PAGAMENTO),
  registradoPor: z.string().min(1).max(120).optional(),
  observacao: z.string().max(500).optional(),
});

router.post("/faturas/:faturaId/pagamentos", async (req, res) => {
  const faturaId = idSchema.parse(req.params.faturaId);
  const body = pagamentoSchema.parse(req.body);
  // A auditoria usa sempre o operador autenticado; o campo do corpo, se enviado, é ignorado.
  const registradoPor = req.usuario ?? body.registradoPor ?? "desconhecido";

  const resultado = await registrarPagamento(prisma, { faturaId, ...body, registradoPor });
  res.status(201).json(resultado);
});

router.get("/dashboard/receitas", async (req, res) => {
  res.json(await receitas(prisma, filtroSchema.parse(req.query)));
});

router.get("/dashboard/inadimplencia", async (req, res) => {
  res.json(await inadimplencia(prisma, filtroSchema.parse(req.query)));
});

router.get("/dashboard/a-receber", async (req, res) => {
  res.json(await aReceber(prisma, filtroSchema.parse(req.query)));
});

router.get("/dashboard/contratos-vencendo", async (req, res) => {
  const dias = req.query.dias ? z.coerce.number().int().min(1).max(3650).parse(req.query.dias) : undefined;
  res.json(await contratosVencendo(prisma, dias));
});

router.get("/dashboard/faturas-atrasadas-recentemente", async (_req, res) => {
  res.json(await faturasAtrasadasRecentemente(prisma));
});

router.get("/dashboard/resumo", async (_req, res) => {
  res.json(await resumoAcaoRapida(prisma));
});

router.get("/dashboard/inquilinos/:inquilinoId/status-periodo", async (req, res) => {
  const inquilinoId = idSchema.parse(req.params.inquilinoId);
  const granularidade = req.query.granularidade === "semana" ? "semana" : "mes";
  res.json(await statusPorPeriodoInquilino(prisma, inquilinoId, granularidade));
});
