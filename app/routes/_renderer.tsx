import { jsxRenderer } from "hono/jsx-renderer";
import { Link } from "honox/server";
import { Script } from "honox/server";
import { THEME_INIT_SCRIPT } from "../lib/theme";

export default jsxRenderer(({ children, title }, c) => {
  const pageTitle = title || "かんじれんしゅう";

  return (
    <html lang="ja">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#d4e4ed" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <title>{pageTitle}</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link href="/manifest.json" rel="manifest" />
        <link href="/icon.svg" rel="icon" type="image/svg+xml" />
        <link href="/icon.svg" rel="apple-touch-icon" />
        <Link href="/app/style.css" rel="stylesheet" />
        <Script src="/app/client.ts" />
      </head>
      <body>{children}</body>
    </html>
  );
});
