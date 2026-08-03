import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL é obrigatório"),
  API_KEY: z
    .string()
    .min(32, "API_KEY deve ter pelo menos 32 caracteres (use: openssl rand -hex 32)"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET deve ter pelo menos 32 caracteres (use: openssl rand -hex 32)"),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cache: Env | undefined;

/** Valida as variáveis de ambiente obrigatórias. Lança e encerra o processo se algo faltar. */
export function carregarEnv(): Env {
  if (cache) return cache;
  const resultado = envSchema.safeParse(process.env);
  if (!resultado.success) {
    const mensagens = resultado.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    // eslint-disable-next-line no-console
    console.error(`Configuração inválida:\n${mensagens}`);
    process.exit(1);
  }
  cache = resultado.data;
  return cache;
}
