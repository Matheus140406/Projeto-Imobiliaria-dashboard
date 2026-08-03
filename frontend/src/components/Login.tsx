import { useState } from "react";
import { api, setCredenciais } from "../lib/api";
import { Btn, ErroBox, Field, Input } from "./ui";

export function Login({ onEntrar }: { onEntrar: () => void }) {
  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrarComApiKey() {
    if (!apiKey.trim()) {
      setErro("Informe a API key.");
      return;
    }
    setCredenciais(apiKey.trim());
    onEntrar();
  }

  async function entrarComLogin() {
    if (!apiKey.trim() || !email.trim() || !senha.trim()) {
      setErro("Preencha API key, email e senha.");
      return;
    }
    setErro("");
    setCarregando(true);
    try {
      setCredenciais(apiKey.trim());
      const resposta = await api.post<{ token: string }>("/auth/login", { email: email.trim(), senha });
      setCredenciais(apiKey.trim(), resposta.token);
      onEntrar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao entrar");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 16, padding: 32, width: 380 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Imobiliária Dashboard</h1>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-muted)" }}>
          Informe a API key da instância do backend. Se você tiver um usuário cadastrado (ADMIN/OPERADOR), pode
          também fazer login para liberar ações administrativas.
        </p>

        {erro && <ErroBox mensagem={erro} />}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="API Key">
            <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="x-api-key do backend" />
          </Field>
          <Btn onClick={entrarComApiKey} style={{ justifyContent: "center" }}>
            Entrar apenas com API Key
          </Btn>

          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>ou faça login</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@imobiliaria.com" />
          </Field>
          <Field label="Senha">
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
          </Field>
          <Btn variant="outline" onClick={entrarComLogin} disabled={carregando} style={{ justifyContent: "center" }}>
            {carregando ? "Entrando…" : "Entrar com login"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
