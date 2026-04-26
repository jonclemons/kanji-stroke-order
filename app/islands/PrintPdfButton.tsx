import { useState } from "hono/jsx";
import { generatePrintSheetPdfBlob } from "../lib/print-pdf";

type PrintPdfButtonProps = {
  filename: string;
  title: string;
};

export default function PrintPdfButton({ filename, title }: PrintPdfButtonProps) {
  const [isBusy, setIsBusy] = useState(false);

  const handlePrint = async () => {
    if (isBusy) return;

    const pdfWindow = window.open("", "_blank");
    setIsBusy(true);

    try {
      const svg = document.querySelector(".print-preview-sheet svg");
      if (!(svg instanceof SVGSVGElement)) {
        throw new Error("Print sheet SVG was not found.");
      }

      const pdfBlob = await generatePrintSheetPdfBlob(svg, title);
      const pdfUrl = URL.createObjectURL(pdfBlob);

      if (pdfWindow) {
        pdfWindow.document.title = filename;
        pdfWindow.location.href = pdfUrl;
      } else {
        window.location.href = pdfUrl;
      }

      window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 10 * 60_000);
    } catch (error) {
      pdfWindow?.close();
      console.error(error);
      window.focus();
      window.print();
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <button
      aria-label={`${title}を いんさつする`}
      class="app-footer-btn is-accent"
      disabled={isBusy}
      onClick={handlePrint}
      type="button"
    >
      <span class="app-footer-btn-text">{isBusy ? "PDFをつくっています" : "いんさつする"}</span>
      <span aria-hidden="true" class="app-footer-btn-icon">
        <PrinterIcon />
      </span>
    </button>
  );
}

function PrinterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}
