import { PrismaClient } from "@prisma/client";

export interface RegistrarLogInput {
  entidade: string;
  entidadeId: string;
  acao: string;
  usuario: string;
  detalhes?: unknown;
}

/**
 * Log genérico de atividade (quem fez o quê e quando) para os cadastros.
 * Nunca deve derrubar a operação principal: falha ao gravar o log é
 * registrada no console, não propagada, para não travar create/update/delete
 * por um problema secundário de auditoria.
 */
export async function registrarLog(prisma: PrismaClient, input: RegistrarLogInput) {
  try {
    await prisma.logAtividade.create({
      data: {
        entidade: input.entidade,
        entidadeId: input.entidadeId,
        acao: input.acao,
        usuario: input.usuario,
        detalhes: input.detalhes ? JSON.stringify(input.detalhes) : undefined,
      },
    });
  } catch (err) {
    console.error("[log-atividade] falha ao registrar log:", err);
  }
}
