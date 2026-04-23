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
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.print();
          });
        });
      }}
    >
      {label}
    </button>
  );
}
