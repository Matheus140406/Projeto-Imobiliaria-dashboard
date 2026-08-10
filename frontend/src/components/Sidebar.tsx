import { Building2, FileText, LayoutDashboard, LogOut, Users, Wallet } from "lucide-react";
import type { Screen } from "../App";
import { limparCredenciais } from "../lib/api";

const NAV: { id: Screen; icon: typeof LayoutDashboard; label: string }[] = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "financeiro", icon: Wallet, label: "Financeiro" },
  { id: "contratos", icon: FileText, label: "Contratos" },
  { id: "imoveis", icon: Building2, label: "Imóveis" },
  { id: "cadastros", icon: Users, label: "Cadastros" },
];

export function Sidebar({ screen, setScreen, onLogout }: { screen: Screen; setScreen: (s: Screen) => void; onLogout: () => void }) {
  return (
    <aside
      style={{
        width: "var(--sidebar-w)", flexShrink: 0, height: "100vh",
        background: "var(--navy)", display: "flex", flexDirection: "column",
        position: "sticky", top: 0,
      }}
    >
      <div style={{ padding: "22px 18px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 9,
              background: "linear-gradient(135deg, var(--red) 0%, var(--red-dark) 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: "-0.04em",
            }}
          >
            IM
          </div>
          <div>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>Imobiliária</div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 500 }}>Dashboard</div>
          </div>
        </div>
      </div>

      <nav style={{ padding: "12px 10px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV.map(({ id, icon: Icon, label }) => (
          <div key={id} className={`nav-item ${screen === id ? "active" : ""}`} onClick={() => setScreen(id)}>
            <Icon size={16} style={{ flexShrink: 0 }} />
            {label}
          </div>
        ))}
      </nav>

      <div
        style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}
        onClick={() => {
          limparCredenciais();
          onLogout();
        }}
      >
        <LogOut size={16} style={{ color: "rgba(255,255,255,0.6)" }} />
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600 }}>Sair</div>
      </div>
    </aside>
  );
}
