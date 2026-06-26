import { Loader2 } from "lucide-react";

export function VideoLoading() {
  return (
    <div className="mx-auto flex min-h-64 w-full max-w-5xl items-center justify-center rounded-2xl border border-white/8 bg-stroy-800">
      <Loader2 size={28} className="animate-spin text-white/40" />
    </div>
  );
}
