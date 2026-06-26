import { useNavigate, useLocation } from "react-router-dom";
import { Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import logoWhite from "@/assets/logo-white.svg";

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className="flex h-screen w-[220px] shrink-0 flex-col border-r border-white/8 bg-stroy-900">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/8">
        <img src={logoWhite} alt="StroyGetter" className="h-6" />
        <span className="font-bold text-white tracking-tight">StroyGetter</span>
      </div>

      {/* New */}
      <div className="px-3 pt-4">
        <button
          onClick={() => navigate("/")}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/6 hover:text-white"
        >
          <Plus size={15} />
          Nouveau
        </button>
      </div>

      {/* History placeholder */}
      <div className="flex-1 overflow-y-auto px-3 pt-4">
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-white/30">
          Historique
        </p>
        {/* Items injectés en Task 10 */}
      </div>

      {/* Settings */}
      <div className="border-t border-white/8 px-3 py-3">
        <button
          onClick={() => navigate("/settings")}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            location.pathname === "/settings"
              ? "bg-white/8 text-white"
              : "text-white/60 hover:bg-white/6 hover:text-white"
          )}
        >
          <Settings size={15} />
          Paramètres
        </button>
      </div>
    </aside>
  );
}
