import { createRoute } from "honox/factory";
import { AppShell } from "../components/AppShell";

export default createRoute((c) => {
  return c.render(
    <AppShell
      currentMeta="privacy"
      currentPath={c.req.path}
      footerActions={
        <a class="app-footer-btn is-secondary" href="/">
          さいしょへ
        </a>
      }
      subtitle="このアプリで あつかう じょうほうについて"
      title="プライバシーポリシー"
      eyebrow="たいせつな おしらせ"
    >
      <div class="data-info-view">
        <div class="data-info-card">
          <h2>プライバシーポリシー</h2>
          <p>このアプリは、できるだけ少ない情報で使えるように作っています。</p>
          <ul class="data-info-list">
            <li>名前、メールアドレス、住所などの個人情報を登録する仕組みはありません。</li>
            <li>しらべた漢字や読み込みずみのデータは、次から早く開けるように、お使いのブラウザの中に保存されることがあります。</li>
            <li>その保存データは、このアプリを動かすために使われ、開発者があとから一人ずつ読むことはできません。</li>
            <li>漢字や書きじゅんのデータを読みこむために、公開データの提供元へ通信が発生することがあります。</li>
            <li>この内容は、アプリの改善にあわせて見なおすことがあります。</li>
          </ul>
        </div>
      </div>
    </AppShell>,
    { title: "プライバシーポリシー" },
  );
});
