import React from "react";
import ReactDOM from "react-dom/client";
import "./globals.css";
import "./lib/i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="min-h-screen bg-stroy-950 text-white flex items-center justify-center">
      <h1 className="text-3xl font-bold">Hello StroyGetter</h1>
    </div>
  </React.StrictMode>
);
