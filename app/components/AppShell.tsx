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
}: AppShellProps) {
  const showDrawer = currentMeta === null;
  const drawerOpensByDefault = currentMeta === null && currentKanji === null;

  return (
    <div class="app-shell">
      <header class="app-header">
        <div class="content-column app-header-inner">
          <div class="app-header-top">
            <a class="app-header-eyebrow" href="/">
              kokugo.app
            </a>
            <ThemeToggleButton />
          </div>
        </div>
      </header>

      {showDrawer ? (
        <section class="app-drawer-section">
          <div class="content-column">
            <details class="kanji-drawer" {...(drawerOpensByDefault ? { open: true } : {})}>
              <summary class="kanji-drawer-toggle">
                <span class="kanji-drawer-toggle-copy">
                  <span class="kanji-drawer-toggle-title">かんじを えらぶ</span>
                  <span class="kanji-drawer-toggle-meta">
                    {currentGrade ? `${currentGrade}年生の かんじ` : "がくねんと かんじを えらぼう"}
                  </span>
                </span>
                <span aria-hidden="true" class="kanji-drawer-toggle-icon">
                  ▾
                </span>
              </summary>

              <div class="kanji-drawer-panel">
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
            </details>
          </div>
        </section>
      ) : null}

      <main class="main-content">
        <div class="content-column main-content-inner">
          <div class="page-intro">
            <h1 class="page-intro-title">{title}</h1>
            <p class="page-intro-subtitle">{subtitle}</p>
          </div>
          {children}
        </div>
      </main>

      <footer class="app-footer">
        <div class="content-column app-footer-inner">
          <div class={`app-footer-actions${footerActions ? "" : " is-empty"}`}>{footerActions}</div>
          <div class="app-footer-meta-links">
            <MetaLink currentMeta={currentMeta} href="/about" label="アプリについて" route="about" />
            <MetaLink currentMeta={currentMeta} href="/privacy" label="プライバシーポリシー" route="privacy" />
            <MetaLink currentMeta={currentMeta} href="/terms" label="利用規約" route="terms" />
          </div>
        </div>
      </footer>
    </div>
  );
}

function ThemeToggleButton() {
  const buttonLabel = "がめんの あかるさを きりかえる";

  return (
    <button
      aria-label={buttonLabel}
      aria-pressed="false"
      class="theme-toggle-btn is-auto"
      id="themeToggleBtn"
      title={buttonLabel}
      type="button"
    >
      <span aria-hidden="true" class="theme-toggle-track">
        <span class="theme-toggle-glyph theme-toggle-glyph-sun">
          <SunIcon />
        </span>
        <span class="theme-toggle-glyph theme-toggle-glyph-moon">
          <MoonIcon />
        </span>
        <span class="theme-toggle-thumb" />
      </span>
      <span class="sr-only">{buttonLabel}</span>
    </button>
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

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.8v2.3" />
      <path d="M12 18.9v2.3" />
      <path d="M4.8 4.8 6.4 6.4" />
      <path d="M17.6 17.6 19.2 19.2" />
      <path d="M2.8 12h2.3" />
      <path d="M18.9 12h2.3" />
      <path d="M4.8 19.2 6.4 17.6" />
      <path d="M17.6 6.4 19.2 4.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15.6 3.6a8.8 8.8 0 1 0 4.8 15.8 9.8 9.8 0 0 1-10.8-10.8 8.9 8.9 0 0 0 6-5Z" />
    </svg>
  );
}
