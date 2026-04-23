import { Hono } from "hono";
import { AppShell } from "../../../../components/AppShell";
import { PrintPreviewSheet, ReadingsSection, StepsSection, WordsSection } from "../../../../components/KanjiSections";
import type { AppEnv } from "../../../../env";
import DeferredPracticeAnimator from "../../../../islands/DeferredPracticeAnimator";
import PrintButton from "../../../../islands/PrintButton";
import { loadKanjiDetailData, parseGrade, parseKanjiParam } from "../../../../lib/data";
import { gradeLabel } from "../../../../lib/kanji";
import { buildPrintSheetSVG } from "../../../../lib/print";
import { gradePath, kanjiPath, printPath } from "../../../../lib/routes";

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

  return c.render(
    <AppShell
      currentGrade={detail.canonicalGrade}
      currentKanji={kanji}
      currentPath={c.req.path}
      footerActions={
        <>
          <a class="app-footer-btn is-secondary" href={gradePath(detail.canonicalGrade || requestedGrade)}>
            ←もどる
          </a>
          <a class="app-footer-btn is-accent" href={printPath(detail.canonicalGrade || requestedGrade, kanji)}>
            いんさつ
          </a>
        </>
      }
      kanjiList={detail.gradeKanji}
      searchValue={kanji}
      subtitle="よみかた、ことば、かきじゅんを みてみよう"
      title={`${kanji} の れんしゅう`}
      eyebrow={`${gradeLabel(detail.canonicalGrade || requestedGrade)} の かんじ`}
    >
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
                <a class="detail-print-link" href={printPath(detail.canonicalGrade || requestedGrade, kanji)}>
                  <span>{kanji}のれんしゅうプリントをいんさつする</span>
                  <span aria-hidden="true" class="detail-print-link-icon">
                    <PrinterIcon />
                  </span>
                </a>
              </div>
            </div>
          </div>
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
        <p class="print-page-eyebrow">いんさつじゅんび</p>
        <h1 class="print-page-title">{`${kanji} を いんさつ`}</h1>
        <p class="print-page-subtitle">ぷれびゅーを みてから したの ぼたんを おしてね</p>
      </header>

      <main class="print-page-main">
        <div class="print-view">
          <p class="print-view-note">プレビューを みてから したの いんさつを おしてね</p>
          <div class="print-view-sheet-wrap">
            <PrintPreviewSheet svgMarkup={svgMarkup} />
          </div>
        </div>
      </main>

      <footer class="print-page-footer">
        <div class="app-footer-actions">
          <a class="app-footer-btn is-secondary" href={kanjiPath(detail.canonicalGrade || requestedGrade, kanji)}>
            ←もどる
          </a>
          <PrintButton className="app-footer-btn is-accent" />
        </div>
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
    </div>,
    { title: `${kanji} を いんさつ` },
  );
});

export default app;

function PrinterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 9.5V4.8h10v4.7" />
      <path d="M7.2 17.8H5.6A2.6 2.6 0 0 1 3 15.2v-4.1a2.6 2.6 0 0 1 2.6-2.6h12.8a2.6 2.6 0 0 1 2.6 2.6v4.1a2.6 2.6 0 0 1-2.6 2.6H16.8" />
      <path d="M7.2 14.2h9.6v5H7.2z" />
      <path d="M16.8 12.2h.01" />
    </svg>
  );
}
