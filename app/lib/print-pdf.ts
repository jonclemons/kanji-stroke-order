const PAGE_MARGIN_MM = 8;
const SHEET_WIDTH_MM = 281;
const SHEET_HEIGHT_MM = 194;
const MM_PER_INCH = 25.4;
const CANVAS_DPI = 220;

export async function generatePrintSheetPdfBlob(svg: SVGSVGElement, title: string) {
  const [{ jsPDF }, pngDataUrl] = await Promise.all([import("jspdf"), svgToPngDataUrl(svg)]);
  const doc = new jsPDF({
    compress: true,
    format: "a4",
    orientation: "landscape",
    unit: "mm",
  });

  doc.setProperties({
    creator: "kokugo.app",
    title,
  });
  doc.addImage(pngDataUrl, "PNG", PAGE_MARGIN_MM, PAGE_MARGIN_MM, SHEET_WIDTH_MM, SHEET_HEIGHT_MM, undefined, "FAST");

  return doc.output("blob");
}

async function svgToPngDataUrl(svg: SVGSVGElement) {
  const svgText = new XMLSerializer().serializeToString(svg);
  const svgBlob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((SHEET_WIDTH_MM / MM_PER_INCH) * CANVAS_DPI);
    canvas.height = Math.round((SHEET_HEIGHT_MM / MM_PER_INCH) * CANVAS_DPI);

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas rendering is unavailable.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not render the print sheet SVG."));
    image.src = src;
  });
}
