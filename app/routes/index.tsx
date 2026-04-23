import { createRoute } from "honox/factory";
import { AppShell } from "../components/AppShell";
import { EmptyState } from "../components/KanjiSections";

export default createRoute((c) => {
  const queryKanji = c.req.query("kanji") || "";
  const queryError = c.req.query("error") || "";

  return c.render(
    <AppShell
      currentPath={c.req.path}
      error={queryError}
      searchValue={queryKanji}
      subtitle="がくねんを えらんで かんじを さがそう"
      title="かんじれんしゅう"
    >
      <EmptyState message="がくねんを えらんで かんじを おしてね" />
    </AppShell>,
    { title: "かんじれんしゅう" },
  );
});
