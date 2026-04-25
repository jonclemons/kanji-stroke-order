import type { Child } from "hono/jsx";
import KanjiPicker from "../islands/KanjiPicker";

type AppShellProps = {
  children: Child;
  currentGrade?: number | null;
  currentKanji?: string | null;
  currentMeta?: "about" | "privacy" | "terms" | null;
  currentPath: string;
  error?: string | null;
  footerActions?: Child;
  kanjiList?: string[];
  listSubtitle?: string;
  listTitle?: string;
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
  listSubtitle,
  listTitle,
  searchValue = "",
  title,
  subtitle,
}: AppShellProps) {
  const showKanjiPicker = currentMeta === null;
  const showInlinePicker = showKanjiPicker && currentKanji === null;

  return (
    <div class="app-shell">
      <header class="app-header">
        <div class="content-column app-header-inner">
          <div class={`app-header-top${showKanjiPicker ? " has-search" : ""}`}>
            <a class="app-header-eyebrow" href="/">
              kokugo.app
            </a>
            {showKanjiPicker ? (
              <HeaderSearch
                currentGrade={currentGrade}
                currentPath={currentPath}
                error={error}
                searchValue={searchValue}
              />
            ) : null}
            <ThemeToggleButton />
          </div>
        </div>
      </header>

      <main class="main-content">
        <div class="content-column main-content-inner">
          <div
            class="page-intro"
            data-default-subtitle={subtitle}
            data-default-title={title}
            data-list-subtitle={listSubtitle || subtitle}
            data-list-title={listTitle || title}
            data-page-intro
          >
            <h1 class="page-intro-title" data-page-intro-title>
              {title}
            </h1>
            <p class="page-intro-subtitle" data-page-intro-subtitle>
              {subtitle}
            </p>
          </div>
          {showInlinePicker ? (
            <KanjiPicker
              currentGrade={currentGrade}
              currentKanji={currentKanji}
              isInline
              kanjiList={kanjiList}
            />
          ) : null}
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

function HeaderSearch({
  currentGrade,
  currentPath,
  error,
  searchValue,
}: {
  currentGrade: number | null;
  currentPath: string;
  error: string | null;
  searchValue: string;
}) {
  return (
    <div class="app-header-search-wrap">
      <form class="app-header-search input-section" method="get" action="/lookup">
        <input
          aria-label="しらべる かんじ"
          id="kanjiInput"
          name="kanji"
          type="text"
          placeholder="漢字"
          maxLength={1}
          value={searchValue}
        />
        <input id="selectedGradeInput" type="hidden" name="grade" value={currentGrade ? String(currentGrade) : ""} />
        <input type="hidden" name="from" value={currentPath} />
        <button aria-label="しらべる" id="lookupBtn" type="submit">
          <SearchIcon />
          <span class="sr-only">しらべる</span>
        </button>
      </form>
      {error ? <div class="app-header-error">{error}</div> : null}
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="10.8" cy="10.8" r="6.2" />
      <path d="m15.4 15.4 5 5" />
    </svg>
  );
}
