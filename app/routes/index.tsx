import { createRoute } from "honox/factory";
import { AppShell } from "../components/AppShell";
import { loadGradeKanji, parseGrade } from "../lib/data";
import { gradePath } from "../lib/routes";

export default createRoute(async (c) => {
  const grade = parseGrade(c.req.query("grade"));
  const kanjiList = grade ? await loadGradeKanji(c, grade) : [];
  const queryKanji = c.req.query("kanji") || "";
  const queryError = c.req.query("error") || "";

  return c.render(
    <AppShell
      currentGrade={grade}
      currentPath={c.req.path}
      error={queryError}
      footerActions={
        <a class="app-footer-btn is-picker is-active" href={grade ? gradePath(grade) : "/"}>
          かんじ いちらん
        </a>
      }
      kanjiList={kanjiList}
      searchValue={queryKanji}
      subtitle="がくねんを えらんで かんじを さがそう"
      title="かんじれんしゅう"
    />,
    { title: "かんじれんしゅう" },
  );
});
