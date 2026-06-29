import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Clipboard, Search } from "lucide-react";


interface Props {
  initialUrl?: string;
}

export function GetterInput({ initialUrl = "" }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState(initialUrl);
  const [pasteError, setPasteError] = useState("");

  const submit = (value: string) => {
    if (!value.trim()) return;
    navigate(`/fetch?url=${encodeURIComponent(value.trim())}`);
  };

  const handlePaste = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      submit(text);
    } catch {
      setPasteError(t("getterInput.errorClipboard"));
      inputRef.current?.focus();
      setTimeout(() => setPasteError(""), 4000);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(url);
      }}
      className="mx-auto w-full max-w-2xl"
    >
      <label
        htmlFor="video-url"
        className="mb-4 flex cursor-text items-center gap-3 rounded-2xl border border-white/16 bg-stroy-950 px-4 py-3.5 transition-colors focus-within:border-white/35"
      >
        <Search size={18} className="shrink-0 text-white/50" />
        <input
          ref={inputRef}
          type="text"
          placeholder={t("getterInput.placeholder")}
          id="video-url"
          name="video-url"
          autoComplete="off"
          className="flex-1 bg-transparent font-mono text-sm text-white/55 outline-none placeholder:text-white/35 focus:text-white"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          title={t("getterInput.pasteTitle")}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/6 px-2.5 py-1.5 text-xs font-semibold text-white/70 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
          onClick={handlePaste}
        >
          <Clipboard size={12} />
          {t("getterInput.pasteButton")}
        </button>
      </label>

      {pasteError && (
        <p className="mb-2 text-center text-xs text-red-400">{pasteError}</p>
      )}

      <button
        type="submit"
        disabled={url.length === 0}
        className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-stroy-900 px-8 py-4 text-base font-bold text-white shadow-md transition-all duration-200 hover:bg-stroy-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("getterInput.searchButton")}
        <ArrowRight size={18} />
      </button>
    </form>
  );
}
