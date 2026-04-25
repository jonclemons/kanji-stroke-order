import { useEffect, useRef, useState } from "hono/jsx";
import { APP_VERSION } from "../../src/version.js";
import { gradePath, kanjiPath } from "../lib/routes";

type KanjiPickerProps = {
  currentGrade: number | null;
  currentKanji: string | null;
  instruction?: string;
  isInline?: boolean;
  kanjiList: string[];
};

const GRADES = [1, 2, 3, 4, 5, 6];
const gradeKanjiCache = new Map<number, string[]>();

function parseGradeValue(value: string | null) {
  const grade = Number.parseInt(value || "", 10);
  return Number.isInteger(grade) && grade >= 1 && grade <= 6 ? grade : null;
}

function readGradeFromLocation() {
  return parseGradeValue(new URL(window.location.href).searchParams.get("grade"));
}

function syncHeaderGradeInput(grade: number | null) {
  const input = document.getElementById("selectedGradeInput");
  if (input instanceof HTMLInputElement) {
    input.value = grade ? String(grade) : "";
  }
}

async function fetchGradeKanji(grade: number) {
  const cached = gradeKanjiCache.get(grade);
  if (cached) return cached;

  const response = await fetch(`/data/${APP_VERSION}/grades/grade-${grade}.json`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load grade ${grade}`);
  }

  const kanji = (await response.json()) as string[];
  gradeKanjiCache.set(grade, kanji);
  return kanji;
}

export default function KanjiPicker({
  currentGrade,
  currentKanji,
  instruction = "",
  isInline = false,
  kanjiList,
}: KanjiPickerProps) {
  const [selectedGrade, setSelectedGrade] = useState<number | null>(currentGrade);
  const [selectedKanjiList, setSelectedKanjiList] = useState(kanjiList);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (currentGrade) {
      gradeKanjiCache.set(currentGrade, kanjiList);
    }
    syncHeaderGradeInput(currentGrade);
  }, [currentGrade, kanjiList]);

  useEffect(() => {
    mountedRef.current = true;

    const handlePopState = () => {
      const grade = readGradeFromLocation();
      setSelectedGrade(grade);
      syncHeaderGradeInput(grade);

      if (!grade) {
        setSelectedKanjiList([]);
        return;
      }

      void fetchGradeKanji(grade).then((nextKanjiList) => {
        if (mountedRef.current) {
          setSelectedKanjiList(nextKanjiList);
        }
      });
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const selectGrade = async (grade: number) => {
    if (window.location.pathname !== "/") {
      window.location.href = gradePath(grade);
      return;
    }

    setSelectedGrade(grade);
    syncHeaderGradeInput(grade);

    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("grade", String(grade));
    window.history.pushState({}, "", `${url.pathname}${url.search}`);

    try {
      setSelectedKanjiList(await fetchGradeKanji(grade));
    } catch {
      window.location.href = gradePath(grade);
    }
  };

  return (
    <details class={`kanji-drawer${isInline ? " is-inline" : ""}`} {...(isInline ? { open: true } : {})}>
      <summary aria-label="かんじを えらぶ" class="kanji-drawer-toggle">
        <span class="sr-only">かんじを えらぶ</span>
        {instruction ? <span class="kanji-drawer-toggle-text">{instruction}</span> : null}
        <span aria-hidden="true" class="kanji-drawer-toggle-icon">
          ▾
        </span>
      </summary>

      <div class="kanji-drawer-panel">
        <nav class="grade-nav" aria-label="学年">
          {GRADES.map((grade) => (
            <a
              class={`grade-btn${grade === selectedGrade ? " active" : ""}`}
              aria-current={grade === selectedGrade ? "page" : undefined}
              href={gradePath(grade)}
              key={grade}
              onClick={(event) => {
                event.preventDefault();
                void selectGrade(grade);
              }}
            >
              {grade}年生
            </a>
          ))}
        </nav>

        {selectedGrade && selectedKanjiList.length > 0 ? (
          <div class="kanji-grid">
            {selectedKanjiList.map((kanji) => (
              <a
                aria-current={kanji === currentKanji ? "page" : undefined}
                class={`kanji-grid-btn${kanji === currentKanji ? " active" : ""}`}
                href={kanjiPath(selectedGrade, kanji)}
                key={kanji}
                onClick={(event) => {
                  if (kanji !== currentKanji) return;
                  event.preventDefault();
                  window.dispatchEvent(new CustomEvent("kanji-view:show-detail"));
                }}
              >
                <span class="kanji-grid-char">{kanji}</span>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}
