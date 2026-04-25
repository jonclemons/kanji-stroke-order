const INFO_PATHS = new Set(["/about", "/privacy", "/terms"]);

export function gradePath(grade: number) {
  const params = new URLSearchParams({ grade: String(grade) });
  return `/?${params.toString()}`;
}

export function kanjiPath(grade: number, kanji: string) {
  return `/grade/${grade}/kanji/${encodeURIComponent(kanji)}`;
}

export function printPath(grade: number, kanji: string) {
  return `${kanjiPath(grade, kanji)}/print`;
}

export function sanitizeReturnPath(path: string | null | undefined) {
  if (!path || !path.startsWith("/")) return "/";
  if (path.startsWith("//")) return "/";
  return path;
}

export function withLookupError(
  basePath: string,
  {
    error,
    grade,
    kanji,
  }: {
    error: string;
    grade?: number | null;
    kanji?: string | null;
  },
) {
  const params = new URLSearchParams();
  params.set("error", error);

  if (kanji) params.set("kanji", kanji);
  if (grade) params.set("grade", String(grade));

  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function isInfoPath(pathname: string) {
  return INFO_PATHS.has(pathname);
}
