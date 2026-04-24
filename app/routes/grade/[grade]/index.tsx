import { createRoute } from "honox/factory";
import { AppShell } from "../../../components/AppShell";
import { EmptyState } from "../../../components/KanjiSections";
import { loadGradeKanji, parseGrade } from "../../../lib/data";

export default createRoute(async (c) => {
  const grade = parseGrade(c.req.param("grade"));
  if (!grade) return c.notFound();

  const kanjiList = await loadGradeKanji(c, grade);

  return c.render(
    <AppShell
      currentGrade={grade}
      currentPath={c.req.path}
      error={c.req.query("error") || ""}
      footerActions={
        <a class="app-footer-btn is-secondary" href="/">
          ←もどる
        </a>
      }
      kanjiList={kanjiList}
      searchValue={c.req.query("kanji") || ""}
      subtitle="したの ますから きになる かんじを おしてね"
      title="かんじを えらぼう"
    >
      <EmptyState message="したの ますから かんじを おしてね" />
    </AppShell>,
    { title: `${grade}年生の かんじ` },
  );
});
