import { createRoute } from "honox/factory";
import { loadKanjiInfo, parseGrade } from "../lib/data";
import { kanjiPath } from "../lib/routes";
import { sanitizeReturnPath, withLookupError } from "../lib/routes";

export default createRoute(async (c) => {
  const kanji = (c.req.query("kanji") || "").trim();
  const preferredGrade = parseGrade(c.req.query("grade"));
  const returnPath = sanitizeReturnPath(c.req.query("from"));

  if (!kanji) {
    return c.redirect(withLookupError(returnPath, { error: "漢字をいれてね", grade: preferredGrade }), 302);
  }

  if ([...kanji].length !== 1) {
    return c.redirect(withLookupError(returnPath, { error: "漢字を一つだけいれてね", grade: preferredGrade, kanji }), 302);
  }

  const info = await loadKanjiInfo(c, kanji);
  const resolvedGrade = info?.grade && info.grade >= 1 && info.grade <= 6 ? info.grade : preferredGrade;

  if (!resolvedGrade) {
    return c.redirect(
      withLookupError(returnPath, {
        error: "このアプリでは その漢字を まだ ひらけません",
        grade: preferredGrade,
        kanji,
      }),
      302,
    );
  }

  return c.redirect(kanjiPath(resolvedGrade, kanji), 302);
});
