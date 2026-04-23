import { getReadingDisplaySets, getStrokeEndingLabel, parseViewBox } from "../lib/kanji";
import type { KanjiInfo, KanjiWord, Stroke } from "../lib/types";

export function EmptyState({ message }: { message: string }) {
  return (
    <div class="empty-state">
      <p>{message}</p>
    </div>
  );
}

export function ReadingsSection({ info }: { info: KanjiInfo }) {
  const readingSets = getReadingDisplaySets(info);
  const groups = [];

  if (readingSets.kun.length > 0) {
    groups.push({ label: "訓読み（くんよみ）", values: readingSets.kun });
  }
  if (readingSets.on.length > 0) {
    groups.push({ label: "音読み（おんよみ）", values: readingSets.on });
  }
  if (info.grade) {
    groups.push({ label: "学年", values: [`${info.grade}年生`] });
  }
  if (info.stroke_count) {
    groups.push({ label: "画数", values: [`${info.stroke_count}画`] });
  }

  return (
    <div class="section">
      <h3>よみかた</h3>
      <div class="readings">
        {groups.map((group) => (
          <div class="reading-group" key={group.label}>
            <div class="label">{group.label}</div>
            <div class="values">
              {group.values.map((value) => (
                <span key={value}>{value}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function WordsSection({ words }: { words: KanjiWord[] }) {
  return (
    <div class="section">
      <h3>この漢字をつかうことば</h3>
      <div class="words-list">
        {words.length > 0 ? (
          words.map((word) => {
            const variant = word.variants?.[0];
            const written = variant?.written || variant?.pronounced || "";
            const pronounced = variant?.pronounced || "";

            return (
              <div class="word-card" key={`${written}-${pronounced}`}>
                <div class="word">{written}</div>
                {pronounced ? <div class="word-reading">{pronounced}</div> : null}
              </div>
            );
          })
        ) : (
          <span style="color:#888">ことばがみつかりません</span>
        )}
      </div>
    </div>
  );
}

export function StepsSection({
  grade,
  strokes,
  viewBox,
}: {
  grade: number;
  strokes: Stroke[];
  viewBox: string;
}) {
  const stepSize = strokes.length > 12 ? 55 : strokes.length > 6 ? 65 : 75;

  return (
    <div class="section">
      <h3>かきじゅん</h3>
      <div class="steps-grid">
        {strokes.map((_, index) => {
          const ending = getStrokeEndingLabel(strokes, index, "detail", grade);
          return (
            <div class="step-card" key={`${index + 1}/${strokes.length}`}>
              <div class="step-card-preview">
                <StepPreviewSvg size={stepSize} strokes={strokes} upToStep={index} viewBox={viewBox} />
                {ending ? <div class="step-ending-rail">{ending}</div> : null}
              </div>
              <div class="step-label">{`${index + 1}/${strokes.length}`}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PrintPreviewSheet({ svgMarkup }: { svgMarkup: string }) {
  return (
    <div class="print-preview-sheet" dangerouslySetInnerHTML={{ __html: svgMarkup }} />
  );
}

function StepPreviewSvg({
  size,
  strokes,
  upToStep,
  viewBox,
}: {
  size: number;
  strokes: Stroke[];
  upToStep: number;
  viewBox: string;
}) {
  const { x, y, width, height } = parseViewBox(viewBox);
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  return (
    <svg height={size} viewBox={viewBox} width={size}>
      <line
        stroke="#c0d0dc"
        stroke-dasharray="3 3"
        stroke-width="0.8"
        x1={centerX}
        x2={centerX}
        y1={y}
        y2={y + height}
      />
      <line
        stroke="#c0d0dc"
        stroke-dasharray="3 3"
        stroke-width="0.8"
        x1={x}
        x2={x + width}
        y1={centerY}
        y2={centerY}
      />

      {strokes.map((stroke, index) => {
        let strokeColor = "#d0dce6";
        let strokeWidth = "2.5";

        if (index < upToStep) {
          strokeColor = "#a0b0bc";
          strokeWidth = "3.5";
        } else if (index === upToStep) {
          strokeColor = "#e8a0aa";
          strokeWidth = "4.5";
        }

        return (
          <path
            d={stroke.d}
            fill="none"
            key={`${stroke.id}-${index}`}
            stroke={strokeColor}
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width={strokeWidth}
          />
        );
      })}
    </svg>
  );
}
