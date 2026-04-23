import type { NotFoundHandler } from "hono";

const handler: NotFoundHandler = (c) => {
  return c.render(
    <main class="app-shell">
      <section class="data-info-view">
        <div class="data-info-card">
          <h2>ページがみつかりません</h2>
          <p>おてすうですが、したの ぼたんから さいしょに もどってください。</p>
          <p>
            <a href="/">←もどる</a>
          </p>
        </div>
      </section>
    </main>,
    { title: "ページがみつかりません" },
  );
};

export default handler;
