import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Textarea } from "@/components/ui/textarea";
import { trackEvent } from "@/lib/analytics";
import {
	readAudioMetadata,
	readLocalImageAsDataUrl,
	writeAudioMetadata,
} from "@/lib/commands";
import { searchItunesCover } from "@/lib/metadata";
import type { ItunesCoverResult, WriteMetadataArgs } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FormState {
	title: string;
	artist: string;
	album: string;
	year: string;
	lyricsPlain: string;
	lyricsLrc: string;
}

export function MetadataEditor() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { t } = useTranslation();

	const [filePath, setFilePath] = useState<string | null>(null);
	const [form, setForm] = useState<FormState>({
		title: "",
		artist: "",
		album: "",
		year: "",
		lyricsPlain: "",
		lyricsLrc: "",
	});
	const [currentCoverDataUrl, setCurrentCoverDataUrl] = useState<string | null>(
		null,
	);
	const [selectedCoverUrl, setSelectedCoverUrl] = useState<string | null>(null);
	const [selectedCoverPath, setSelectedCoverPath] = useState<string | null>(
		null,
	);
	const [selectedCoverPreview, setSelectedCoverPreview] = useState<
		string | null
	>(null);
	const [itunesResults, setItunesResults] = useState<ItunesCoverResult[]>([]);
	const [itunesQuery, setItunesQuery] = useState("");
	const [isSearching, setIsSearching] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);

	useEffect(() => {
		const path = searchParams.get("path");
		if (path) {
			trackEvent("metadata_opened_from", { from: "sidebar" });
			handleLoadFile(decodeURIComponent(path));
		} else {
			trackEvent("metadata_opened_from", { from: "file_picker" });
			handleOpenPicker();
		}
	}, []);

	async function handleOpenPicker() {
		try {
			const selected = await open({
				multiple: false,
				filters: [{ name: "Audio", extensions: ["mp3"] }],
			});
			if (selected && typeof selected === "string") {
				handleLoadFile(selected);
			} else {
				navigate(-1);
			}
		} catch {
			navigate(-1);
		}
	}

	async function handleLoadFile(path: string) {
		setIsLoading(true);
		setLoadError(null);
		try {
			const meta = await readAudioMetadata(path);
			setFilePath(path);
			setForm({
				title: meta.title ?? "",
				artist: meta.artist ?? "",
				album: meta.album ?? "",
				year: meta.year ?? "",
				lyricsPlain: meta.lyricsPlain ?? "",
				lyricsLrc: meta.lyricsLrc ?? "",
			});
			setCurrentCoverDataUrl(meta.coverBase64 ?? null);
			if (meta.title && meta.artist) {
				const q = `${meta.artist} ${meta.title}`;
				setItunesQuery(q);
				runItunesSearch(q);
			}
		} catch (e) {
			setLoadError(e instanceof Error ? e.message : "Failed to read file");
		} finally {
			setIsLoading(false);
		}
	}

	async function runItunesSearch(query: string) {
		if (!query.trim()) return;
		setIsSearching(true);
		trackEvent("itunes_cover_searched");
		try {
			const results = await searchItunesCover(query);
			setItunesResults(results);
		} finally {
			setIsSearching(false);
		}
	}

	async function handlePickLocalCover() {
		const selected = await open({
			multiple: false,
			filters: [{ name: "Image", extensions: ["jpg", "jpeg", "png", "webp"] }],
		});
		if (selected && typeof selected === "string") {
			setSelectedCoverPath(selected);
			setSelectedCoverUrl(null);
			try {
				const dataUrl = await readLocalImageAsDataUrl(selected);
				setSelectedCoverPreview(dataUrl);
			} catch {
				setSelectedCoverPreview(null);
			}
		}
	}

	async function handleSave() {
		if (!filePath) return;
		setSaveError(null);
		setSaveSuccess(false);
		setIsSaving(true);
		try {
			const args: WriteMetadataArgs = {
				path: filePath,
				title: form.title,
				artist: form.artist,
				album: form.album,
				year: form.year,
				coverUrl: selectedCoverPath
					? undefined
					: (selectedCoverUrl ?? undefined),
				coverPath: selectedCoverPath ?? undefined,
				lyricsPlain: form.lyricsPlain,
				lyricsLrc: form.lyricsLrc,
			};
			await writeAudioMetadata(args);
			trackEvent("metadata_saved", {
				has_cover: selectedCoverUrl !== null || selectedCoverPath !== null,
				has_lyrics_plain: form.lyricsPlain.trim().length > 0,
				has_lyrics_lrc: form.lyricsLrc.trim().length > 0,
				has_year: form.year.trim().length > 0,
				cover_source: selectedCoverPath
					? "local_file"
					: selectedCoverUrl
						? "itunes"
						: "none",
			});
			setSaveSuccess(true);
		} catch (e) {
			setSaveError(
				e instanceof Error ? e.message : t("metadataEditor.saveError"),
			);
		} finally {
			setIsSaving(false);
		}
	}

	const displayCover =
		selectedCoverPreview ?? selectedCoverUrl ?? currentCoverDataUrl;

	if (isLoading) {
		return (
			<div className="flex min-h-64 items-center justify-center">
				<p className="text-sm text-white/40">Loading…</p>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className="flex flex-col gap-4 px-6 py-8">
				<p className="text-sm text-red-400">{loadError}</p>
				<button
					type="button"
					onClick={handleOpenPicker}
					className="self-start rounded-lg bg-stroy-500 px-4 py-2 text-sm font-semibold text-white hover:bg-stroy-600 transition-colors"
				>
					{t("metadataEditor.pickFile")}
				</button>
			</div>
		);
	}

	if (!filePath) return null;

	return (
		<div className="flex flex-col gap-6 px-6 py-8 max-w-2xl mx-auto">
			<h1 className="text-xl font-bold text-white">
				{t("metadataEditor.title")}
			</h1>
			<p className="text-xs text-white/30 truncate">{filePath}</p>

			{/* Cover + text fields */}
			<div className="flex gap-4">
				<div className="shrink-0 flex flex-col gap-1.5">
					<button
						type="button"
						onClick={handlePickLocalCover}
						title="Choisir une image depuis vos fichiers"
						className="group relative size-28 overflow-hidden rounded-xl"
					>
						{displayCover ? (
							<img
								src={displayCover}
								alt="Cover"
								className="size-full object-cover"
							/>
						) : (
							<div className="flex size-full items-center justify-center bg-stroy-800">
								<Tag size={24} className="text-white/20" />
							</div>
						)}
						<div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
							<FolderOpen size={20} className="text-white" />
						</div>
					</button>
					<p className="text-center text-[10px] text-white/30">
						Depuis fichier
					</p>
				</div>
				<div className="flex flex-1 flex-col gap-2">
					{(["title", "artist", "album"] as const).map((field) => (
						<input
							key={field}
							type="text"
							placeholder={t(`metadataEditor.fields.${field}`)}
							value={form[field]}
							onChange={(e) =>
								setForm((f) => ({ ...f, [field]: e.target.value }))
							}
							className="w-full rounded-lg bg-stroy-800 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-stroy-500"
						/>
					))}
					<input
						type="text"
						placeholder={t("metadataEditor.fields.year")}
						value={form.year}
						onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
						className="w-24 rounded-lg bg-stroy-800 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-stroy-500"
					/>
				</div>
			</div>

			{/* iTunes cover search */}
			<div className="flex flex-col gap-3">
				<p className="text-[10px] font-bold uppercase tracking-widest text-white/30">
					{t("metadataEditor.cover.search")}
				</p>
				<div className="flex gap-2">
					<input
						type="text"
						placeholder={t("metadataEditor.cover.searchPlaceholder")}
						value={itunesQuery}
						onChange={(e) => setItunesQuery(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && runItunesSearch(itunesQuery)}
						className="flex-1 rounded-lg bg-stroy-800 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:ring-1 focus:ring-stroy-500"
					/>
					<button
						type="button"
						onClick={() => runItunesSearch(itunesQuery)}
						disabled={isSearching}
						className="rounded-lg bg-stroy-500 px-4 py-2 text-sm font-semibold text-white hover:bg-stroy-600 disabled:opacity-50 transition-colors"
					>
						{isSearching ? "…" : t("metadataEditor.cover.searchButton")}
					</button>
				</div>
				{itunesResults.length > 0 && (
					<div className="flex gap-2">
						{itunesResults.map((r, index) => (
							<button
								key={r.artworkUrl}
								type="button"
								onClick={() => {
									if (selectedCoverUrl !== r.artworkUrl) {
										trackEvent("itunes_cover_selected", {
											result_position: index,
										});
									}
									setSelectedCoverPath(null);
									setSelectedCoverUrl((prev) =>
										prev === r.artworkUrl ? null : r.artworkUrl,
									);
								}}
								title={`${r.artistName} — ${r.collectionName}`}
								className={cn(
									"size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all",
									selectedCoverUrl === r.artworkUrl
										? "border-stroy-500 scale-105"
										: "border-transparent opacity-70 hover:opacity-100",
								)}
							>
								<img
									src={r.artworkUrl}
									alt={r.collectionName}
									className="size-full object-cover"
								/>
							</button>
						))}
					</div>
				)}
			</div>

			{/* Plain lyrics */}
			<div className="flex flex-col gap-2">
				<label
					htmlFor="lyrics-plain"
					className="text-[10px] font-bold uppercase tracking-widest text-white/30"
				>
					{t("metadataEditor.lyrics.plain")}
				</label>
				<Textarea
					id="lyrics-plain"
					value={form.lyricsPlain}
					onChange={(e) =>
						setForm((f) => ({ ...f, lyricsPlain: e.target.value }))
					}
					rows={6}
					placeholder={"Verse 1\nLine one\nLine two"}
					className="resize-y"
				/>
			</div>

			{/* LRC lyrics */}
			<div className="flex flex-col gap-2">
				<label
					htmlFor="lyrics-lrc"
					className="text-[10px] font-bold uppercase tracking-widest text-white/30"
				>
					{t("metadataEditor.lyrics.lrc")}
				</label>
				<Textarea
					id="lyrics-lrc"
					value={form.lyricsLrc}
					onChange={(e) =>
						setForm((f) => ({ ...f, lyricsLrc: e.target.value }))
					}
					rows={6}
					placeholder={"[00:01.00] Line one\n[00:05.50] Line two"}
					className="resize-y font-mono"
				/>
			</div>

			{/* Status + Save */}
			<div className="flex items-center justify-between">
				<div>
					{saveSuccess && (
						<p className="text-sm font-medium text-green-400">
							{t("metadataEditor.saveSuccess")}
						</p>
					)}
					{saveError && (
						<p className="text-sm font-medium text-red-400">{saveError}</p>
					)}
				</div>
				<button
					type="button"
					onClick={handleSave}
					disabled={isSaving}
					className="rounded-xl bg-stroy-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-stroy-600 disabled:opacity-50 transition-colors"
				>
					{isSaving ? "…" : t("metadataEditor.save")}
				</button>
			</div>
		</div>
	);
}
