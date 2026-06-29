const RELEASES_URL = "https://api.github.com/repos/DestroyCom/Stroygetter-Native/releases/latest";
export const RELEASES_PAGE = "https://github.com/DestroyCom/Stroygetter-Native/releases";

/** Returns true if `candidate` is strictly newer than `current` (semver subset: major.minor.patch). */
export function isNewer(current: string, candidate: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const [ca = 0, cb = 0, cc = 0] = parse(current);
  const [na = 0, nb = 0, nc = 0] = parse(candidate);
  if (na !== ca) return na > ca;
  if (nb !== cb) return nb > cb;
  return nc > cc;
}

export interface UpdateInfo {
  latestVersion: string;
  releaseUrl: string;
  isNewer: boolean;
}

export async function checkForUpdate(currentVersion: string): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(RELEASES_URL, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latestVersion = data.tag_name?.replace(/^v/, "") ?? "";
    if (!latestVersion) return null;
    return {
      latestVersion,
      releaseUrl: data.html_url ?? RELEASES_PAGE,
      isNewer: isNewer(currentVersion, latestVersion),
    };
  } catch {
    return null;
  }
}
