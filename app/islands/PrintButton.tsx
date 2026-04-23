export default function PrintButton({
  className,
  label = "いんさつする",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button
      class={className}
      type="button"
      onClick={() => {
        const previewSvg = document.querySelector(".print-preview-sheet svg");

        if (!(previewSvg instanceof SVGSVGElement)) {
          window.print();
          return;
        }

        const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1200,height=900");
        if (!printWindow) {
          window.print();
          return;
        }

        const title = document.title || "いんさつ";
        const printableSvg = previewSvg.outerHTML;

        printWindow.document.open();
        printWindow.document.write(`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        size: landscape;
        margin: 8mm;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #fff;
      }

      body {
        display: flex;
        justify-content: center;
        align-items: flex-start;
      }

      svg {
        display: block;
        width: 280mm;
        height: 193mm;
        max-width: none;
        max-height: none;
      }
    </style>
  </head>
  <body>
    ${printableSvg}
    <script>
      window.addEventListener("load", () => {
        window.focus();
        window.print();
      });
      window.addEventListener("afterprint", () => {
        window.close();
      });
    </script>
  </body>
</html>`);
        printWindow.document.close();
      }}
    >
      {label}
    </button>
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
