import { createRoute } from "honox/factory";
import { AppShell } from "../components/AppShell";
import { loadGradeKanji, parseGrade } from "../lib/data";

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
      kanjiList={kanjiList}
      pickerInstruction="がくねんを えらんで かんじを さがそう"
      searchValue={queryKanji}
      subtitle=""
      title="かんじれんしゅう"
    />,
    { title: "かんじれんしゅう" },
  );
});
