import { useEffect, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Login } from "./components/Login";
import { aoReceberNaoAutorizado, estaAutenticado } from "./lib/api";
import { Dashboard } from "./screens/Dashboard";
import { Financeiro } from "./screens/Financeiro";
import { Contratos } from "./screens/Contratos";
import { Imoveis } from "./screens/Imoveis";
import { Cadastros } from "./screens/Cadastros";

export type Screen = "dashboard" | "financeiro" | "contratos" | "imoveis" | "cadastros";

export default function App() {
  const [autenticado, setAutenticado] = useState(estaAutenticado());
  const [screen, setScreen] = useState<Screen>("dashboard");

  useEffect(() => {
    // Se o token expirar/for invalidado no meio do uso, qualquer chamada à API que
    // devolver 401 dispara isto — desloga e volta pra tela de login em vez de deixar
    // todas as telas presas em "Falha ao carregar" pra sempre.
    aoReceberNaoAutorizado(() => setAutenticado(false));
  }, []);

  if (!autenticado) {
    return <Login onEntrar={() => setAutenticado(true)} />;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar screen={screen} setScreen={setScreen} onLogout={() => setAutenticado(false)} />
      <main style={{ flex: 1, padding: "28px 32px", overflow: "auto", minWidth: 0 }}>
        {screen === "dashboard" && <Dashboard setScreen={setScreen} />}
        {screen === "financeiro" && <Financeiro />}
        {screen === "contratos" && <Contratos />}
        {screen === "imoveis" && <Imoveis />}
        {screen === "cadastros" && <Cadastros />}
      </main>
    </div>
  );
}
