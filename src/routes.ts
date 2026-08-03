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
import { criarInquilino, excluirInquilino, listarInquilinos } from "./cadastros/inquilinoService";
import { buscarFiador, criarFiador, excluirFiador, listarFiadores } from "./cadastros/fiadorService";
import { buscarImovel, criarImovel, excluirImovel, listarImoveis } from "./cadastros/imovelService";
import {
  buscarContrato,
  criarContrato,
  encerrarContrato,
  historicoParcelas,
  listarContratos,
} from "./cadastros/contratoService";

export const router = Router();

const idSchema = z.string().min(1).max(64);
const cpfSchema = z.string().min(11).max(14);

const filtroSchema = z.object({
  competenciaInicio: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  competenciaFim: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  imovelId: idSchema.optional(),
  inquilinoId: idSchema.optional(),
});

// Express 5 encaminha automaticamente rejeições de Promise (inclusive de z.parse) para o
// middleware de erro central — não é necessário try/catch em cada rota.

// ---------------------------------------------------------------------------
// Cadastros: Inquilinos
// ---------------------------------------------------------------------------

const inquilinoSchema = z.object({
  nome: z.string().min(1).max(200),
  cpf: cpfSchema,
  email: z.string().email().max(200).optional(),
  telefone: z.string().max(20).optional(),
});

router.post("/inquilinos", async (req, res) => {
  const dados = inquilinoSchema.parse(req.body);
  res.status(201).json(await criarInquilino(prisma, dados));
});

router.get("/inquilinos", async (_req, res) => {
  res.json(await listarInquilinos(prisma));
});

router.delete("/inquilinos/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await excluirInquilino(prisma, id));
});

// ---------------------------------------------------------------------------
// Cadastros: Fiadores
// ---------------------------------------------------------------------------

const fiadorSchema = z.object({
  nome: z.string().min(1).max(200),
  cpf: cpfSchema,
});

router.post("/fiadores", async (req, res) => {
  const dados = fiadorSchema.parse(req.body);
  res.status(201).json(await criarFiador(prisma, dados));
});

router.get("/fiadores", async (_req, res) => {
  res.json(await listarFiadores(prisma));
});

router.get("/fiadores/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await buscarFiador(prisma, id));
});

router.delete("/fiadores/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await excluirFiador(prisma, id));
});

// ---------------------------------------------------------------------------
// Cadastros: Imóveis
// ---------------------------------------------------------------------------

const imovelSchema = z.object({
  endereco: z.string().min(1).max(300),
  valorPadrao: z.number().positive().finite().max(1_000_000_000),
});

router.post("/imoveis", async (req, res) => {
  const dados = imovelSchema.parse(req.body);
  res.status(201).json(await criarImovel(prisma, dados));
});

router.get("/imoveis", async (req, res) => {
  const apenasDisponiveis = req.query.disponiveis === "true";
  res.json(await listarImoveis(prisma, apenasDisponiveis));
});

router.get("/imoveis/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await buscarImovel(prisma, id));
});

router.delete("/imoveis/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await excluirImovel(prisma, id));
});

// ---------------------------------------------------------------------------
// Contratos (passo a passo: inquilino, imóvel, garantia, valores)
// ---------------------------------------------------------------------------

const contratoSchema = z
  .object({
    inquilinoId: idSchema,
    imovelId: idSchema,
    fiadorId: idSchema.optional(),
    valorAluguel: z.number().positive().finite().max(1_000_000_000),
    diaVencimento: z.number().int().min(1).max(31),
    tipoGarantia: z.enum(["CAUCAO", "FIADOR"]),
    valorCaucao: z.number().positive().finite().optional(),
    dataInicio: z.coerce.date(),
    dataFim: z.coerce.date(),
    percentualMulta: z.number().min(0).max(100).optional(),
    taxaJurosDiaria: z.number().min(0).max(100).optional(),
  })
  .refine((dados) => dados.tipoGarantia !== "FIADOR" || !!dados.fiadorId, {
    message: "fiadorId é obrigatório quando tipoGarantia é FIADOR",
    path: ["fiadorId"],
  });

router.post("/contratos", async (req, res) => {
  const dados = contratoSchema.parse(req.body);
  res.status(201).json(await criarContrato(prisma, dados));
});

router.get("/contratos", async (_req, res) => {
  res.json(await listarContratos(prisma));
});

router.get("/contratos/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await buscarContrato(prisma, id));
});

router.get("/contratos/:id/parcelas", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await historicoParcelas(prisma, id));
});

router.post("/contratos/:id/encerrar", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  res.json(await encerrarContrato(prisma, id));
});

// ---------------------------------------------------------------------------
// Financeiro: faturas e pagamentos
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

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
