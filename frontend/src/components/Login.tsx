import { useState } from "react";
import { api, ApiError, setSessao, type UsuarioLogado } from "../lib/api";
import { Btn, ErroBox, Field, Input } from "./ui";

export function Login({ onEntrar }: { onEntrar: () => void }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar() {
    if (!email.trim() || !senha.trim()) {
      setErro("Preencha email e senha.");
      return;
    }
    setErro("");
    setCarregando(true);
    try {
      const resposta = await api.post<{ token: string; usuario: UsuarioLogado }>("/auth/login", {
        email: email.trim(),
        senha,
      });
      setSessao(resposta.token, resposta.usuario);
      onEntrar();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Falha ao entrar");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          entrar();
        }}
        style={{ background: "#fff", border: "1.5px solid var(--border)", borderRadius: 16, padding: 32, width: 380 }}
      >
        <h1 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700 }}>Imobiliária Dashboard</h1>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--text-muted)" }}>Entre com seu email e senha.</p>

        {erro && <ErroBox mensagem={erro} />}

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@imobiliaria.com" autoFocus />
          </Field>
          <Field label="Senha">
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
          </Field>
          <Btn type="submit" disabled={carregando} style={{ justifyContent: "center" }}>
            {carregando ? "Entrando…" : "Entrar"}
          </Btn>
        </div>
      </form>
    </div>
  );
}
