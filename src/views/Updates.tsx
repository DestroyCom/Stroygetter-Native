import { useTranslation } from "react-i18next";

export function Updates() {
  const { i18n } = useTranslation();
  const src = `https://stroygetter.fr/${i18n.language}/updates`;

  return (
    <div className="flex h-full flex-col">
      <iframe
        src={src}
        className="flex-1 w-full border-0"
        title="StroyGetter updates"
      />
    </div>
  );
}
