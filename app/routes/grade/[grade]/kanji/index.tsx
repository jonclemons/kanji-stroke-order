import { Hono } from "hono";
import { AppShell } from "../../../../components/AppShell";
import { PrintPreviewSheet, ReadingsSection, StepsSection, WordsSection } from "../../../../components/KanjiSections";
import type { AppEnv } from "../../../../env";
import DeferredPracticeAnimator from "../../../../islands/DeferredPracticeAnimator";
import KanjiPicker from "../../../../islands/KanjiPicker";
import { loadKanjiDetailData, parseGrade, parseKanjiParam } from "../../../../lib/data";
import { buildPrintSheetSVG } from "../../../../lib/print";
import { kanjiPath, printPath } from "../../../../lib/routes";

const app = new Hono<AppEnv>();

app.get("/:char", async (c) => {
  const requestedGrade = parseGrade(c.req.param("grade"));
  if (!requestedGrade) return c.notFound();

  const kanji = parseKanjiParam(c.req.param("char"));
  const detail = await loadKanjiDetailData(c, kanji, requestedGrade);
  if (!detail) return c.notFound();

  if (detail.canonicalGrade !== requestedGrade) {
    return c.redirect(kanjiPath(detail.canonicalGrade || requestedGrade, kanji), 302);
  }

  const printGrade = detail.canonicalGrade || requestedGrade;
  const printTitle = `${kanji}のれんしゅうシート`;
  const svgMarkup = buildPrintSheetSVG({
    grade: printGrade,
    info: detail.info,
    strokeNumbers: detail.strokeNumbers,
    strokes: detail.strokes,
  });

  return c.render(
    <AppShell
      currentGrade={detail.canonicalGrade}
      currentKanji={kanji}
      currentPath={c.req.path}
      error={c.req.query("error") || ""}
      footerActions={
        <>
          <button class="app-footer-btn is-picker" data-kanji-list-toggle type="button">
            かんじ いちらん
          </button>
          <a
            aria-label={`${kanji}のれんしゅうシートを いんさつする`}
            class="app-footer-btn is-accent"
            data-kanji-detail-only
            data-print-now
            data-print-title={printTitle}
            href={printPath(printGrade, kanji)}
          >
            <span class="app-footer-btn-text">れんしゅうシート</span>
            <span aria-hidden="true" class="app-footer-btn-icon">
              <PrinterIcon />
            </span>
          </a>
        </>
      }
      kanjiList={detail.gradeKanji}
      searchValue={c.req.query("kanji") || kanji}
      subtitle="よみかた、ことば、かきじゅんを みてみよう"
      title={`${kanji} の れんしゅう`}
    >
      <div class="kanji-detail-switcher" data-kanji-detail-switcher>
        <div data-kanji-detail-panel>
          <div class="results">
            <div class="results-columns">
              <div class="results-primary">
                <DeferredPracticeAnimator
                  grade={detail.canonicalGrade || requestedGrade}
                  strokes={detail.strokes}
                  viewBox={detail.viewBox}
                />
                <StepsSection
                  grade={detail.canonicalGrade || requestedGrade}
                  strokes={detail.strokes}
                  viewBox={detail.viewBox}
                />
              </div>

              <div class="results-side">
                <ReadingsSection info={detail.info} />
                <WordsSection words={detail.filteredWords} />
                <div class="section">
                  <h3>れんしゅうシート</h3>
                  <div class="practice-options">
                    <a
                      aria-label={`${kanji}のれんしゅうシートを いんさつする`}
                      class="detail-print-preview-link"
                      data-print-now
                      data-print-title={printTitle}
                      href={printPath(printGrade, kanji)}
                    >
                      <div aria-hidden="true" class="detail-print-preview">
                        <PrintPreviewSheet svgMarkup={svgMarkup} />
                      </div>
                      <span class="sr-only">{kanji}のれんしゅうシートを いんさつする</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="hidden" data-kanji-list-panel>
          <KanjiPicker currentGrade={detail.canonicalGrade} currentKanji={kanji} isInline kanjiList={detail.gradeKanji} />
        </div>
      </div>
    </AppShell>,
    { title: `${kanji} の れんしゅう` },
  );
});

app.get("/:char/print", async (c) => {
  const requestedGrade = parseGrade(c.req.param("grade"));
  if (!requestedGrade) return c.notFound();

  const kanji = parseKanjiParam(c.req.param("char"));
  const detail = await loadKanjiDetailData(c, kanji, requestedGrade);
  if (!detail) return c.notFound();

  if (detail.canonicalGrade !== requestedGrade) {
    return c.redirect(printPath(detail.canonicalGrade || requestedGrade, kanji), 302);
  }

  const svgMarkup = buildPrintSheetSVG({
    grade: detail.canonicalGrade || requestedGrade,
    info: detail.info,
    strokeNumbers: detail.strokeNumbers,
    strokes: detail.strokes,
  });

  return c.render(
    <div class="print-page">
      <header class="print-page-header">
        <h1 class="print-page-title">{`${kanji}のかんじれんしゅうプリント を いんさつする`}</h1>
      </header>

      <main class="print-page-main">
        <div class="print-view">
          <div class="print-view-toolbar">
            <a class="app-footer-btn is-secondary" href={kanjiPath(detail.canonicalGrade || requestedGrade, kanji)}>
              ←もどる
            </a>
            <button class="app-footer-btn is-accent" id="printRouteBtn" type="button">
              いんさつする
            </button>
          </div>
          <p class="print-view-note">プレビューを みてから したの いんさつを おしてね</p>
          <div class="print-view-sheet-wrap">
            <PrintPreviewSheet svgMarkup={svgMarkup} />
          </div>
        </div>
      </main>

      <footer class="print-page-footer print-page-footer--meta-only">
        <div class="app-footer-meta-links">
          <a class="app-footer-meta-link" href="/about">
            アプリについて
          </a>
          <a class="app-footer-meta-link" href="/privacy">
            プライバシーポリシー
          </a>
          <a class="app-footer-meta-link" href="/terms">
            利用規約
          </a>
        </div>
      </footer>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            (() => {
              const printButton = document.getElementById('printRouteBtn');
              if (!(printButton instanceof HTMLButtonElement)) return;
              printButton.addEventListener('click', () => {
                window.focus();
                window.print();
              });
            })();
          `,
        }}
      />
    </div>,
    { title: `${kanji}のれんしゅうシート` },
  );
});

function PrinterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}

export default app;
