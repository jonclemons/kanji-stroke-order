export function createSvgElement<TagName extends keyof SVGElementTagNameMap>(tagName: TagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

export function parseViewBox(viewBox: string) {
  const [x = 0, y = 0, width = 109, height = 109] = viewBox.split(/\s+/).map(Number);
  return { x, y, width, height };
}

export function addCrossGuide(svg: SVGSVGElement, viewBox: string, color: string) {
  const { x, y, width, height } = parseViewBox(viewBox);
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  const verticalLine = createSvgElement("line");
  verticalLine.setAttribute("x1", String(centerX));
  verticalLine.setAttribute("x2", String(centerX));
  verticalLine.setAttribute("y1", String(y));
  verticalLine.setAttribute("y2", String(y + height));
  verticalLine.setAttribute("stroke", color);
  verticalLine.setAttribute("stroke-width", "0.8");
  verticalLine.setAttribute("stroke-dasharray", "3 3");

  const horizontalLine = createSvgElement("line");
  horizontalLine.setAttribute("x1", String(x));
  horizontalLine.setAttribute("x2", String(x + width));
  horizontalLine.setAttribute("y1", String(centerY));
  horizontalLine.setAttribute("y2", String(centerY));
  horizontalLine.setAttribute("stroke", color);
  horizontalLine.setAttribute("stroke-width", "0.8");
  horizontalLine.setAttribute("stroke-dasharray", "3 3");

  svg.appendChild(verticalLine);
  svg.appendChild(horizontalLine);
}

export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };

  const inverse = ctm.inverse();
  return {
    x: inverse.a * clientX + inverse.c * clientY + inverse.e,
    y: inverse.b * clientX + inverse.d * clientY + inverse.f,
  };
}
