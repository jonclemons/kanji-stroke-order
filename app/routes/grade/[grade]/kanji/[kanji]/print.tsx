import { createRoute } from "honox/factory";
import { AppShell } from "../../../../../components/AppShell";
import { PrintPreviewSheet } from "../../../../../components/KanjiSections";
import PrintButton from "../../../../../islands/PrintButton";
import { loadKanjiDetailData, parseGrade, parseKanjiParam } from "../../../../../lib/data";
import { buildPrintSheetSVG } from "../../../../../lib/print";
import { kanjiPath, printPath } from "../../../../../lib/routes";

export default createRoute(async (c) => {
  const requestedGrade = parseGrade(c.req.param("grade"));
  if (!requestedGrade) return c.notFound();

  const kanji = parseKanjiParam(c.req.param("kanji"));
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
    <AppShell
      currentGrade={detail.canonicalGrade}
      currentKanji={kanji}
      currentPath={c.req.path}
      footerActions={
        <>
          <a class="app-footer-btn is-secondary" href={kanjiPath(detail.canonicalGrade || requestedGrade, kanji)}>
            ←もどる
          </a>
          <PrintButton className="app-footer-btn is-accent" />
        </>
      }
      kanjiList={detail.gradeKanji}
      searchValue={kanji}
      subtitle="ぷれびゅーを みてから したの ぼたんを おしてね"
      title={`${kanji} を いんさつ`}
      eyebrow="いんさつじゅんび"
    >
      <div class="print-view">
        <p class="print-view-note">プレビューを みてから したの いんさつを おしてね</p>
        <div class="print-view-sheet-wrap">
          <PrintPreviewSheet svgMarkup={svgMarkup} />
        </div>
      </div>
    </AppShell>,
    { title: `${kanji} を いんさつ` },
  );
});
