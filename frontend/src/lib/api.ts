const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getApiKey(): string {
  return localStorage.getItem("apiKey") ?? "";
}

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setCredenciais(apiKey: string, token?: string | null) {
  localStorage.setItem("apiKey", apiKey);
  if (token) localStorage.setItem("token", token);
}

export function limparCredenciais() {
  localStorage.removeItem("apiKey");
  localStorage.removeItem("token");
}

export function estaAutenticado(): boolean {
  return Boolean(getApiKey());
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
    throw new ApiError(resposta.status, mensagem || "Erro na requisição");
  }

  return corpo as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { BASE_URL };
