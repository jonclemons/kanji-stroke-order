import { getReadingDisplaySets, getStrokeEndingLabel } from "./kanji";
import type { KanjiInfo, Stroke, StrokeNumber } from "./types";

function buildVerticalSvgLabel(text: string, x: number, y: number, width: number, height: number) {
  if (!text) return "";

  const fontSize = 2.05;
  const lineHeight = 2.45;
  const fill = "#4d6c50";
  const stroke = "#9ec5a0";
  const background = "#f5f0e8";
  const chars = [...text];
  const totalHeight = (chars.length - 1) * lineHeight;
  const startY = y + height / 2 - totalHeight / 2 + fontSize * 0.35;
  let labelSvg = `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="1.2" fill="${background}" stroke="${stroke}" stroke-width="0.25"/>`;

  chars.forEach((char, index) => {
    labelSvg += `<text x="${x + width / 2}" y="${startY + index * lineHeight}" text-anchor="middle" font-size="${fontSize}" fill="${fill}" font-weight="bold">${char}</text>`;
  });

  return labelSvg;
}

export function buildPrintSheetSVG({
  grade,
  info,
  strokeNumbers,
  strokes,
}: {
  grade: number;
  info: KanjiInfo;
  strokeNumbers: StrokeNumber[];
  strokes: Stroke[];
}) {
  const readingSets = getReadingDisplaySets(info, {
    onLimit: 6,
    kunLimit: 6,
    totalLimit: 6,
  });
  const strokeCount = info.stroke_count || strokes.length;
  const onReadings = readingSets.on;
  const kunReadings = readingSets.kun;
  const showPrintEndingLabels = grade >= 1 && grade <= 6;

  function strokePaths(cx: number, cy: number, size: number, color: string, strokeWidth: number, upTo?: number) {
    const scale = size / 109;
    let paths = "";
    const end = upTo !== undefined ? upTo + 1 : strokes.length;

    for (let index = 0; index < end; index += 1) {
      const currentColor = upTo !== undefined && index === upTo ? "#e8a0aa" : color;
      const currentStrokeWidth = upTo !== undefined && index === upTo ? strokeWidth * 1.1 : strokeWidth;
      paths += `<path d="${strokes[index].d}" fill="none" stroke="${currentColor}" stroke-width="${currentStrokeWidth / scale}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${cx},${cy}) scale(${scale})"/>`;
    }

    return paths;
  }

  function strokeNumbersSVG(cx: number, cy: number, size: number, count: number) {
    const scale = size / 109;
    let numbers = "";

    for (let index = 0; index < count && index < strokeNumbers.length; index += 1) {
      const strokeNumber = strokeNumbers[index];
      const x = cx + strokeNumber.x * scale;
      const y = cy + strokeNumber.y * scale;
      const radius = 1.5 * scale * 109 / size;

      numbers += `<circle cx="${x}" cy="${y - 0.5}" r="${Math.max(1.2, radius)}" fill="white" stroke="#e8a0aa" stroke-width="0.15" opacity="0.9"/>`;
      numbers += `<text x="${x}" y="${y + 0.3}" text-anchor="middle" font-size="${Math.max(1.5, 2 * scale * 109 / size)}" fill="#e8a0aa" font-weight="bold">${strokeNumber.num}</text>`;
    }

    return numbers;
  }

  function crossGuide(cx: number, cy: number, size: number) {
    const half = size / 2;
    return `<line x1="${cx + half}" y1="${cy}" x2="${cx + half}" y2="${cy + size}" stroke="#d0c8c8" stroke-width="0.2" stroke-dasharray="1 1"/>`
      + `<line x1="${cx}" y1="${cy + half}" x2="${cx + size}" y2="${cy + half}" stroke="#d0c8c8" stroke-width="0.2" stroke-dasharray="1 1"/>`;
  }

  const width = 281;
  const height = 194;
  const sixthWidth = width / 6;
  const margin = 2;

  const leftWidth = sixthWidth * 4;
  const practiceCols = 5;
  const practiceRows = 5;
  const cellSize = Math.min(
    Math.floor((leftWidth - margin * 2) / practiceCols),
    Math.floor((height - margin * 2) / practiceRows),
  );
  const gridX = margin;
  const gridY = margin + Math.floor((height - margin * 2 - practiceRows * cellSize) / 2);

  const panelX = sixthWidth * 4;
  const panelWidth = sixthWidth * 2;

  let kakijunMaxCols;
  let kakijunMaxRows;
  if (strokes.length <= 4) {
    kakijunMaxCols = 2;
    kakijunMaxRows = 2;
  } else if (strokes.length <= 9) {
    kakijunMaxCols = 3;
    kakijunMaxRows = 3;
  } else if (strokes.length <= 12) {
    kakijunMaxCols = 4;
    kakijunMaxRows = 3;
  } else {
    kakijunMaxCols = 5;
    kakijunMaxRows = 4;
  }

  let svg = "";

  for (let row = 0; row < practiceRows; row += 1) {
    for (let col = 0; col < practiceCols; col += 1) {
      const cx = gridX + col * cellSize;
      const cy = gridY + row * cellSize;
      svg += `<rect x="${cx}" y="${cy}" width="${cellSize}" height="${cellSize}" fill="none" stroke="#aaa" stroke-width="0.3"/>`;
      svg += crossGuide(cx, cy, cellSize);
      if (col === practiceCols - 1 && row < 2) {
        svg += strokePaths(cx + 1, cy + 1, cellSize - 2, "#ccc", 0.8);
      }
    }
  }

  const contentLeft = panelX + 4;
  const contentRight = panelX + panelWidth - 4;
  const contentWidth = contentRight - contentLeft;

  const referenceSize = Math.min(contentWidth, 60);
  const referenceX = contentLeft + (contentWidth - referenceSize) / 2;
  const referenceY = margin + 2;

  svg += `<rect x="${referenceX}" y="${referenceY}" width="${referenceSize}" height="${referenceSize}" rx="3" fill="none" stroke="#e8a0aa" stroke-width="1"/>`;
  svg += crossGuide(referenceX, referenceY, referenceSize);
  svg += strokePaths(referenceX + 1.5, referenceY + 1.5, referenceSize - 3, "#333", 1.0);
  svg += strokeNumbersSVG(referenceX + 1.5, referenceY + 1.5, referenceSize - 3, strokes.length);

  let rightY = referenceY + referenceSize + 5;
  svg += `<text x="${contentLeft + contentWidth / 2}" y="${rightY}" text-anchor="middle" font-size="3.5" fill="#333" font-weight="bold">${strokeCount}かく</text>`;

  rightY += 4;
  const headerHeight = 6;
  const columnHeaderHeight = 6;
  const charSize = 3.5;
  const charHeight = 4.5;
  const readingSpacing = 6;
  const allReadings = [...kunReadings, ...onReadings];
  const maxReadingLength = allReadings.reduce((max, reading) => Math.max(max, reading.length), 0);
  const readingsBodyHeight = Math.max(20, maxReadingLength * charHeight + 8);
  const totalReadingsHeight = headerHeight + columnHeaderHeight + readingsBodyHeight;
  const columnWidth = contentWidth / 2;
  const midX = contentLeft + columnWidth;

  svg += `<rect x="${contentLeft}" y="${rightY}" width="${contentWidth}" height="${totalReadingsHeight}" rx="2" fill="none" stroke="#9ec5a0" stroke-width="0.4"/>`;
  svg += `<text x="${contentLeft + contentWidth / 2}" y="${rightY + 4}" text-anchor="middle" font-size="2.5" fill="#9ec5a0" font-weight="bold">よみかた</text>`;
  svg += `<line x1="${contentLeft}" y1="${rightY + headerHeight}" x2="${contentRight}" y2="${rightY + headerHeight}" stroke="#9ec5a0" stroke-width="0.3"/>`;

  const columnHeaderY = rightY + headerHeight;
  svg += `<rect x="${contentLeft}" y="${columnHeaderY}" width="${columnWidth}" height="${columnHeaderHeight}" fill="none" stroke="#9ec5a0" stroke-width="0.3"/>`;
  svg += `<rect x="${midX}" y="${columnHeaderY}" width="${columnWidth}" height="${columnHeaderHeight}" fill="none" stroke="#9ec5a0" stroke-width="0.3"/>`;
  svg += `<text x="${contentLeft + columnWidth / 2}" y="${columnHeaderY + 4}" text-anchor="middle" font-size="2.5" fill="#9ec5a0" font-weight="bold">くん</text>`;
  svg += `<text x="${midX + columnWidth / 2}" y="${columnHeaderY + 4}" text-anchor="middle" font-size="2.5" fill="#9ec5a0" font-weight="bold">おん</text>`;
  svg += `<line x1="${midX}" y1="${columnHeaderY + columnHeaderHeight}" x2="${midX}" y2="${rightY + totalReadingsHeight}" stroke="#9ec5a0" stroke-width="0.2"/>`;

  const bodyY = columnHeaderY + columnHeaderHeight + 5;

  for (let readingIndex = 0; readingIndex < kunReadings.length; readingIndex += 1) {
    const reading = kunReadings[readingIndex];
    const x = contentLeft + columnWidth - 4 - readingIndex * readingSpacing;
    for (let charIndex = 0; charIndex < reading.length; charIndex += 1) {
      svg += `<text x="${x}" y="${bodyY + charIndex * charHeight}" font-size="${charSize}" fill="#333" text-anchor="middle">${reading[charIndex]}</text>`;
    }
  }

  for (let readingIndex = 0; readingIndex < onReadings.length; readingIndex += 1) {
    const reading = onReadings[readingIndex];
    const x = midX + columnWidth - 4 - readingIndex * readingSpacing;
    for (let charIndex = 0; charIndex < reading.length; charIndex += 1) {
      svg += `<text x="${x}" y="${bodyY + charIndex * charHeight}" font-size="${charSize}" fill="#333" text-anchor="middle">${reading[charIndex]}</text>`;
    }
  }

  rightY += totalReadingsHeight + 4;
  const kakijunAvailableHeight = height - rightY - margin;
  const labelSpace = 5;
  const labelWidth = showPrintEndingLabels ? 4.2 : 0;
  const labelGap = showPrintEndingLabels ? 1.1 : 0;
  const itemGap = 2;
  const labelBlockWidth = showPrintEndingLabels ? labelWidth + labelGap : 0;
  const kakijunCellSizeByWidth = (contentWidth - (kakijunMaxCols - 1) * itemGap - kakijunMaxCols * labelBlockWidth) / kakijunMaxCols;
  const kakijunCellSizeByHeight = (kakijunAvailableHeight / kakijunMaxRows) - labelSpace;
  const kakijunCellSize = Math.min(kakijunCellSizeByWidth, kakijunCellSizeByHeight);
  const kakijunUnitWidth = kakijunCellSize + labelBlockWidth;

  function stepPaths(cx: number, cy: number, size: number, upToStep: number) {
    const scale = size / 109;
    let paths = "";

    for (let index = 0; index < strokes.length; index += 1) {
      let color = "#d0dce6";
      let strokeWidth = 0.45;

      if (index < upToStep) {
        color = "#a0b0bc";
        strokeWidth = 0.6;
      } else if (index === upToStep) {
        color = "#e8a0aa";
        strokeWidth = 0.7;
      }

      paths += `<path d="${strokes[index].d}" fill="none" stroke="${color}" stroke-width="${strokeWidth / scale}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${cx},${cy}) scale(${scale})"/>`;
    }

    return paths;
  }

  for (let index = 0; index < strokes.length; index += 1) {
    const column = index % kakijunMaxCols;
    const row = Math.floor(index / kakijunMaxCols);
    const itemsInRow = Math.min(kakijunMaxCols, strokes.length - row * kakijunMaxCols);
    const rowWidth = itemsInRow * kakijunUnitWidth + (itemsInRow - 1) * itemGap;
    const rowStartX = contentLeft + (contentWidth - rowWidth) / 2;
    const unitX = rowStartX + column * (kakijunUnitWidth + itemGap);
    const cx = unitX;
    const cy = rightY + row * (kakijunCellSize + labelSpace);
    const ending = getStrokeEndingLabel(strokes, index, "print", grade);

    svg += `<rect x="${cx}" y="${cy}" width="${kakijunCellSize}" height="${kakijunCellSize}" rx="1.5" fill="none" stroke="#d0d8dc" stroke-width="0.25"/>`;
    svg += crossGuide(cx, cy, kakijunCellSize);
    svg += stepPaths(cx + 0.5, cy + 0.5, kakijunCellSize - 1, index);

    if (showPrintEndingLabels && ending) {
      svg += buildVerticalSvgLabel(ending, cx + kakijunCellSize + labelGap, cy + 1, labelWidth, kakijunCellSize - 2);
    }

    svg += `<text x="${unitX + kakijunUnitWidth / 2}" y="${cy + kakijunCellSize + 3.5}" text-anchor="middle" font-size="2.2" fill="#7a7a7a">${index + 1}/${strokes.length}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="'Hiragino Kaku Gothic ProN','Meiryo','Yu Gothic',sans-serif">
${svg}
</svg>`;
}
