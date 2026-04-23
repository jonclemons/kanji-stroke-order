import { jsxRenderer } from "hono/jsx-renderer";
import { Link } from "honox/server";
import { Script } from "honox/server";

export default jsxRenderer(({ children, title }) => {
  const pageTitle = title || "かんじれんしゅう";
  const themeBootScript = `
    (() => {
      try {
        const stored = localStorage.getItem("kanji-theme-mode");
        const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const theme = stored === "dark" || stored === "light" ? stored : (systemDark ? "dark" : "light");
        document.documentElement.dataset.theme = theme;
      } catch (_) {}
    })();
  `;

  return (
    <html lang="ja">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#edf2f5" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1f252c" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <title>{pageTitle}</title>
        <link href="/manifest.json" rel="manifest" />
        <link href="/icon.svg" rel="icon" type="image/svg+xml" />
        <link href="/icon.svg" rel="apple-touch-icon" />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <Link href="/app/style.css" rel="stylesheet" />
        <Script src="/app/client.ts" />
      </head>
      <body>{children}</body>
    </html>
  );
});
