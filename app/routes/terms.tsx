import { createRoute } from "honox/factory";
import { AppShell } from "../components/AppShell";

export default createRoute((c) => {
  return c.render(
    <AppShell
      currentMeta="terms"
      currentPath={c.req.path}
      footerActions={
        <a class="app-footer-btn is-secondary" href="/">
          さいしょへ
        </a>
      }
      subtitle="このアプリの つかいかたについて"
      title="利用規約"
      eyebrow="たいせつな おしらせ"
    >
      <div class="data-info-view">
        <div class="data-info-card">
          <h2>利用規約</h2>
          <p>このアプリは、学校やおうちでの学習に役立ててもらうための無料アプリです。</p>
          <ul class="data-info-list">
            <li>小学生、先生、保護者の方が、学習や授業のために気軽に使えます。</li>
            <li>内容はできるだけ正しくなるよう努めていますが、いつでも完全に正確であることをお約束するものではありません。</li>
            <li>アプリの内容や表示、使える機能は、予告なく変わることがあります。</li>
            <li>メンテナンスなどのために、一時的に使えなくなることがあります。</li>
            <li>このアプリで使っているデータやライセンスは、それぞれの提供元の条件にしたがいます。</li>
          </ul>
        </div>
      </div>
    </AppShell>,
    { title: "利用規約" },
  );
});
