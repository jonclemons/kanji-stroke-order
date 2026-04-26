import { Hono } from "hono";
import { AppShell } from "../../../../components/AppShell";
import { PrintPreviewSheet, ReadingsSection, StepsSection, WordsSection } from "../../../../components/KanjiSections";
import type { AppEnv } from "../../../../env";
import DeferredPracticeAnimator from "../../../../islands/DeferredPracticeAnimator";
import KanjiPicker from "../../../../islands/KanjiPicker";
import PrintPdfButton from "../../../../islands/PrintPdfButton";
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
          <PrintPdfButton
            detailOnly
            filename={`${printTitle}.pdf`}
            label="れんしゅうシート"
            title={printTitle}
          />
        </>
      }
      kanjiList={detail.gradeKanji}
      listSubtitle=""
      listTitle="かんじれんしゅう"
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
                    <button
                      aria-label={`${kanji}のれんしゅうシートを いんさつする`}
                      class="detail-print-preview-link"
                      data-print-pdf-title={printTitle}
                      data-print-pdf-trigger
                      data-print-pdf-filename={`${printTitle}.pdf`}
                      type="button"
                    >
                      <div aria-hidden="true" class="detail-print-preview">
                        <PrintPreviewSheet svgMarkup={svgMarkup} />
                      </div>
                      <span class="sr-only">{kanji}のれんしゅうシートを いんさつする</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="hidden" data-kanji-list-panel>
          <KanjiPicker
            currentGrade={detail.canonicalGrade}
            currentKanji={kanji}
            instruction="がくねんを えらんで かんじを さがそう"
            isInline
            kanjiList={detail.gradeKanji}
          />
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
  const printTitle = `${kanji}のれんしゅうシート`;

  return c.render(
    <div class="print-page">
      <header class="print-page-header">
        <h1 class="print-page-title">{printTitle}</h1>
      </header>

      <main class="print-page-main">
        <div class="print-view">
          <div class="print-view-toolbar">
            <a class="app-footer-btn is-secondary" href={kanjiPath(detail.canonicalGrade || requestedGrade, kanji)}>
              ←もどる
            </a>
            <PrintPdfButton filename={`${printTitle}.pdf`} title={printTitle} />
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

    </div>,
    { title: printTitle },
  );
});

export default app;
