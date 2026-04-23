import type { Child } from "hono/jsx";
import { gradePath, kanjiPath } from "../lib/routes";

type AppShellProps = {
  children: Child;
  currentGrade?: number | null;
  currentKanji?: string | null;
  currentMeta?: "about" | "privacy" | "terms" | null;
  currentPath: string;
  error?: string | null;
  footerActions?: Child;
  kanjiList?: string[];
  searchValue?: string;
  title: string;
  subtitle: string;
  eyebrow?: string;
};

export function AppShell({
  children,
  currentGrade = null,
  currentKanji = null,
  currentMeta = null,
  currentPath,
  error = null,
  footerActions = null,
  kanjiList = [],
  searchValue = "",
  title,
  subtitle,
  eyebrow = "こくごアプリ",
}: AppShellProps) {
  const shellClasses = ["app-shell"];

  if (currentKanji) {
    shellClasses.push("is-detail-view");
  }

  return (
    <div class={shellClasses.join(" ")}>
      <header class="app-header">
        <p class="app-header-eyebrow">{eyebrow}</p>
        <h1 class="app-header-title">{title}</h1>
        <p class="app-header-subtitle">{subtitle}</p>
      </header>

      <div class="app-layout">
        <aside class="sidebar">
          <div class="sidebar-content">
            <h2 class="sidebar-heading">かんじを えらぶ</h2>

            <form class="input-section" method="get" action="/lookup">
              <input
                id="kanjiInput"
                name="kanji"
                type="text"
                placeholder="漢字"
                maxLength={1}
                value={searchValue}
              />
              {currentGrade ? <input type="hidden" name="grade" value={String(currentGrade)} /> : null}
              <input type="hidden" name="from" value={currentPath} />
              <button id="lookupBtn" type="submit">
                しらべる
              </button>
            </form>

            <div class="error">{error || ""}</div>

            <nav class="grade-nav" aria-label="学年">
              {[1, 2, 3, 4, 5, 6].map((grade) => (
                <a
                  class={`grade-btn${grade === currentGrade ? " active" : ""}`}
                  aria-current={grade === currentGrade ? "page" : undefined}
                  href={gradePath(grade)}
                  key={grade}
                >
                  {grade}年生
                </a>
              ))}
            </nav>

            {kanjiList.length > 0 ? (
              <div class="kanji-grid">
                {kanjiList.map((kanji) => (
                  <a
                    aria-current={kanji === currentKanji ? "page" : undefined}
                    class={`kanji-grid-btn${kanji === currentKanji ? " active" : ""}`}
                    href={kanjiPath(currentGrade || 1, kanji)}
                    key={kanji}
                  >
                    <span class="kanji-grid-char">{kanji}</span>
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        </aside>

        <main class="main-content">{children}</main>
      </div>

      <footer class="app-footer">
        <div class={`app-footer-actions${footerActions ? "" : " is-empty"}`}>{footerActions}</div>
        <div class="app-footer-meta-links">
          <MetaLink currentMeta={currentMeta} href="/about" label="アプリについて" route="about" />
          <MetaLink currentMeta={currentMeta} href="/privacy" label="プライバシーポリシー" route="privacy" />
          <MetaLink currentMeta={currentMeta} href="/terms" label="利用規約" route="terms" />
        </div>
      </footer>
    </div>
  );
}

function MetaLink({
  currentMeta,
  href,
  label,
  route,
}: {
  currentMeta: AppShellProps["currentMeta"];
  href: string;
  label: string;
  route: NonNullable<AppShellProps["currentMeta"]>;
}) {
  if (currentMeta === route) {
    return (
      <span aria-current="page" class="app-footer-meta-link is-active">
        {label}
      </span>
    );
  }

  return (
    <a class="app-footer-meta-link" href={href}>
      {label}
    </a>
  );
}
