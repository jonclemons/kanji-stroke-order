import { createRoute } from "honox/factory";
import { AppShell } from "../components/AppShell";

export default createRoute((c) => {
  return c.render(
    <AppShell
      currentMeta="about"
      currentPath={c.req.path}
      footerActions={
        <a class="app-footer-btn is-secondary" href="/">
          ←もどる
        </a>
      }
      subtitle="このアプリの ねがいと データのことを まとめています"
      title="このアプリについて"
    >
      <div class="data-info-view">
        <div class="data-info-card">
          <h2>このアプリについて</h2>
          <h3>ミッション</h3>
          <p>
            このアプリは、日本の小学生や先生が、学校やおうちで漢字をすばやく調べて、読み方や書き順、練習のしかたをすぐに確かめられるようにするための無料アプリです。どうぞ気軽に使ってください。よかったら、お友だちや先生にも知らせてもらえたらうれしいです。
          </p>
          <p>
            このアプリは、小学校で日本語を学んでいる2人の子どもの父親が作り、今も少しずつよくしています。もともとは自分の子どもたちのために作りはじめましたが、今は日本語を学ぶほかの子どもたちにも役立ててもらえたらと思っています。
          </p>
        </div>

        <div class="data-info-card">
          <h3>データとライセンス</h3>
          <p>
            <a href="https://github.com/KanjiVG/kanjivg" rel="noreferrer" target="_blank">
              <strong>KanjiVG</strong>
            </a>{" "}
            は、かきじゅんの データです。ライセンスは CC BY-SA 3.0 です。
          </p>

          <p>
            <a href="https://github.com/onlyskin/kanjiapi.dev" rel="noreferrer" target="_blank">
              <strong>kanjiapi.dev</strong>
            </a>{" "}
            は、漢字や ことばの じょうほうの もとです。リポジトリは MIT License です。
          </p>

          <p>
            <a href="https://www.edrdg.org/edrdg/licence.html" rel="noreferrer" target="_blank">
              <strong>EDRDG</strong>
            </a>{" "}
            の{" "}
            <a
              href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project"
              rel="noreferrer"
              target="_blank"
            >
              <strong>JMdict</strong>
            </a>{" "}
            と{" "}
            <a
              href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project"
              rel="noreferrer"
              target="_blank"
            >
              <strong>KANJIDIC2</strong>
            </a>{" "}
            に もとづく データを ふくみます。ライセンスは CC BY-SA 4.0 です。
          </p>
        </div>
      </div>
    </AppShell>,
    { title: "このアプリについて" },
  );
});
