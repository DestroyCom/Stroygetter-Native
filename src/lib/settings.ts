export interface DownloadSettings {
  useCookies: boolean;
  cookiesBrowser: string;
  analyticsEnabled: boolean;
  errorReportingEnabled: boolean;
}

const KEY = "stroygetter-dl-settings";

const DEFAULTS: DownloadSettings = {
  useCookies: false,
  cookiesBrowser: "",
  analyticsEnabled: true,
  errorReportingEnabled: true,
};

export function loadDownloadSettings(): DownloadSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveDownloadSettings(patch: Partial<DownloadSettings>): DownloadSettings {
  const next = { ...loadDownloadSettings(), ...patch };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
