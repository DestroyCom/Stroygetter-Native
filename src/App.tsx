import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "@/components/custom/Sidebar";
import { BottomNav } from "@/components/custom/BottomNav";
import { Home } from "@/views/Home";
import { Fetch } from "@/views/Fetch";
import { Settings } from "@/views/Settings";

export function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-stroy-950 text-white">
        {/* Sidebar desktop uniquement */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/fetch" element={<Fetch />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>

        {/* Bottom nav mobile uniquement */}
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
