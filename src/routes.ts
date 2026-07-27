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
} from "./dashboard/dashboardService";

export const router = Router();

const filtroSchema = z.object({
  competenciaInicio: z.string().optional(),
  competenciaFim: z.string().optional(),
  imovel: z.string().optional(),
  inquilinoId: z.string().optional(),
});

function filtroDaQuery(query: unknown) {
  return filtroSchema.parse(query);
}

router.post("/faturas/gerar/:contratoId", async (req, res) => {
  try {
    const fatura = await gerarFaturaMensal(prisma, req.params.contratoId);
    res.status(201).json(fatura);
  } catch (err) {
    res.status(400).json({ erro: (err as Error).message });
  }
});

router.post("/faturas/gerar-mes", async (_req, res) => {
  const faturas = await gerarFaturasDoMes(prisma);
  res.status(201).json(faturas);
});

router.post("/faturas/marcar-atrasadas", async (_req, res) => {
  const atualizadas = await marcarFaturasAtrasadas(prisma);
  res.json(atualizadas);
});

const pagamentoSchema = z.object({
  valorPago: z.number().positive(),
  metodo: z.string().min(1),
  registradoPor: z.string().min(1),
  observacao: z.string().optional(),
});

router.post("/faturas/:faturaId/pagamentos", async (req, res) => {
  try {
    const body = pagamentoSchema.parse(req.body);
    const resultado = await registrarPagamento(prisma, { faturaId: req.params.faturaId, ...body });
    res.status(201).json(resultado);
  } catch (err) {
    res.status(400).json({ erro: (err as Error).message });
  }
});

router.get("/dashboard/receitas", async (req, res) => {
  res.json(await receitas(prisma, filtroDaQuery(req.query)));
});

router.get("/dashboard/inadimplencia", async (req, res) => {
  res.json(await inadimplencia(prisma, filtroDaQuery(req.query)));
});

router.get("/dashboard/a-receber", async (req, res) => {
  res.json(await aReceber(prisma, filtroDaQuery(req.query)));
});

router.get("/dashboard/contratos-vencendo", async (req, res) => {
  const dias = req.query.dias ? Number(req.query.dias) : undefined;
  res.json(await contratosVencendo(prisma, dias));
});

router.get("/dashboard/faturas-atrasadas-recentemente", async (_req, res) => {
  res.json(await faturasAtrasadasRecentemente(prisma));
});

router.get("/dashboard/resumo", async (_req, res) => {
  res.json(await resumoAcaoRapida(prisma));
});
