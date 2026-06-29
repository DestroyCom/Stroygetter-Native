import { Progress } from "@/components/ui/progress";

interface VideoLoadingProps {
	elapsed?: number;
}

export function VideoLoading({ elapsed = 0 }: VideoLoadingProps) {
	// Eases toward 90% over ~15s, never completes on its own
	const simulated = Math.min(
		90,
		(elapsed / 15) * 100 * (1 - Math.exp(-elapsed / 6)),
	);

	return (
		<div className="mx-auto flex min-h-64 w-full max-w-5xl flex-col items-center justify-center gap-4 rounded-2xl border border-white/8 bg-stroy-800 px-8">
			<div className="flex w-full max-w-xs flex-col gap-2">
				<div className="flex items-center justify-between text-xs text-white/40">
					<span>Analyse en cours...</span>
					<span>{elapsed}s</span>
				</div>
				<Progress value={simulated} className="h-1.5 bg-white/10" />
			</div>
		</div>
	);
}
