import { useNavigate, useLocation } from "react-router-dom";
import { Home, Clock, Settings, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { path: "/", icon: Home, label: "Accueil" },
  { path: "/", icon: Clock, label: "Historique" },
  { path: "/metadata-editor", icon: Tag, label: "Metadata" },
  { path: "/settings", icon: Settings, label: "Paramètres" },
];

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 flex border-t border-white/8 bg-stroy-900 md:hidden">
      {TABS.map(({ path, icon: Icon, label }) => (
        <button
          key={label}
          onClick={() => navigate(path)}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors",
            location.pathname === path ? "text-white" : "text-white/50"
          )}
        >
          <Icon size={20} />
          {label}
        </button>
      ))}
    </nav>
  );
}
