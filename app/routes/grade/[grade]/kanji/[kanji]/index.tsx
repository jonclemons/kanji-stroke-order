import { createRoute } from "honox/factory";
import { AppShell } from "../../../../../components/AppShell";
import { ReadingsSection, StepsSection, WordsSection } from "../../../../../components/KanjiSections";
import PracticeAnimator from "../../../../../islands/PracticeAnimator";
import { loadKanjiDetailData, parseGrade, parseKanjiParam } from "../../../../../lib/data";
import { gradeLabel } from "../../../../../lib/kanji";
import { gradePath, kanjiPath, printPath } from "../../../../../lib/routes";

export default createRoute(async (c) => {
  const requestedGrade = parseGrade(c.req.param("grade"));
  if (!requestedGrade) return c.notFound();

  const kanji = parseKanjiParam(c.req.param("kanji"));
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
            かんじいちらん
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
            <PracticeAnimator
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
                <a class="app-footer-btn is-accent detail-print-link" href={printPath(detail.canonicalGrade || requestedGrade, kanji)}>
                  いんさつ
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
