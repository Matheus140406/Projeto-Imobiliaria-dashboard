const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";
// A API Key é fixa, definida no .env de cada máquina/dev (nunca commitada) — o
// usuário final só faz login com email/senha, sem precisar saber que ela existe.
// Ela ainda é enviada em toda requisição (é exigida pelo backend), só não aparece
// mais na tela; qualquer pessoa com acesso ao DevTools do navegador consegue lê-la
// no bundle, então ela não é mais "secreta" nesse sentido — só não fica visível na UI.
const BUILTIN_API_KEY = import.meta.env.VITE_API_KEY ?? "";

export type Papel = "ADMIN" | "OPERADOR";
export interface UsuarioLogado {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Chamado quando uma resposta 401 chega (token ausente/expirado/inválido) — a tela de
// login é quem registra isso, pra poder deslogar e mostrar a tela de login de novo em
// vez de deixar toda tela presa num "Falha ao carregar..." permanente.
let aoDeslogar: (() => void) | null = null;
export function aoReceberNaoAutorizado(callback: () => void) {
  aoDeslogar = callback;
}

function getApiKey(): string {
  return BUILTIN_API_KEY;
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setSessao(token: string, usuario: UsuarioLogado) {
  localStorage.setItem("token", token);
  localStorage.setItem("usuario", JSON.stringify(usuario));
}

export function limparCredenciais() {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
}

export function estaAutenticado(): boolean {
  return Boolean(getToken());
}

export function usuarioAtual(): UsuarioLogado | null {
  const bruto = localStorage.getItem("usuario");
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as UsuarioLogado;
  } catch {
    return null;
  }
}

export function ehAdmin(): boolean {
  return usuarioAtual()?.papel === "ADMIN";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": getApiKey(),
    ...(options.headers as Record<string, string> | undefined),
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resposta = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (resposta.status === 204) return undefined as T;

  const contentType = resposta.headers.get("content-type") ?? "";
  const corpo = contentType.includes("application/json") ? await resposta.json() : await resposta.text();

  if (!resposta.ok) {
    const mensagem = typeof corpo === "object" && corpo && "erro" in corpo ? String((corpo as { erro: unknown }).erro) : String(corpo);
    // Token expirado/inválido: desloga automaticamente em vez de deixar toda tela presa
    // em "Falha ao carregar" sem o usuário entender que precisa entrar de novo. Não
    // dispara no próprio POST /auth/login (senha errada também é 401, mas aí o usuário
    // já está na tela de login e só precisa ver a mensagem de erro).
    if (resposta.status === 401 && !path.startsWith("/auth/login")) {
      limparCredenciais();
      aoDeslogar?.();
    }
    throw new ApiError(resposta.status, mensagem || "Erro na requisição");
  }

  return corpo as T;
}

/** Baixa um endpoint que devolve arquivo (CSV, PDF, texto) e dispara o download no navegador. */
async function baixarArquivo(path: string, nomeArquivo: string): Promise<void> {
  const headers: Record<string, string> = { "x-api-key": getApiKey() };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const resposta = await fetch(`${BASE_URL}${path}`, { headers });
  if (!resposta.ok) {
    if (resposta.status === 401) {
      limparCredenciais();
      aoDeslogar?.();
    }
    const corpo = await resposta.text();
    throw new ApiError(resposta.status, corpo || "Falha ao baixar arquivo");
  }

  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  baixar: baixarArquivo,
};

export { BASE_URL };
