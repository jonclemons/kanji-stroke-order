import { createRoute } from "honox/factory";
import { parseGrade } from "../../../lib/data";

export default createRoute(async (c) => {
  const grade = parseGrade(c.req.param("grade"));
  if (!grade) return c.notFound();

  const params = new URLSearchParams({ grade: String(grade) });
  const error = c.req.query("error");
  const kanji = c.req.query("kanji");
  if (error) params.set("error", error);
  if (kanji) params.set("kanji", kanji);

  return c.redirect(`/?${params.toString()}`, 302);
});
