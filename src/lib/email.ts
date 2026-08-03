import nodemailer from "nodemailer";

/** Só considera o envio de email configurado se todas as variáveis SMTP estiverem presentes. */
export function envioDeEmailConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

export interface EnviarEmailInput {
  destinatario: string;
  assunto: string;
  corpo: string;
}

/**
 * Envia um email via SMTP configurado por variáveis de ambiente. Chame
 * `envioDeEmailConfigurado()` antes — esta função assume que a configuração existe.
 */
export async function enviarEmail(input: EnviarEmailInput): Promise<void> {
  const transportador = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  await transportador.sendMail({
    from: process.env.SMTP_FROM,
    to: input.destinatario,
    subject: input.assunto,
    text: input.corpo,
  });
}
