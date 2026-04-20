const appShell = `
  <div class="app-shell">
    <header class="app-header">
      <p id="appHeaderEyebrow" class="app-header-eyebrow">こくごアプリ</p>
      <h1 id="appHeaderTitle" class="app-header-title">かんじれんしゅう</h1>
      <p id="appHeaderSubtitle" class="app-header-subtitle">がくねんを えらんで かんじを さがそう</p>
    </header>

    <div class="app-layout">
      <aside class="sidebar">
        <button id="sidebarToggle" class="sidebar-toggle hidden">▼ 漢字をえらぶ</button>
        <div id="sidebarContent" class="sidebar-content">
          <h2 class="sidebar-heading">かんじを えらぶ</h2>

          <div class="input-section">
            <input type="text" id="kanjiInput" placeholder="漢字" maxlength="1">
            <button id="lookupBtn">しらべる</button>
          </div>
          <div id="error" class="error"></div>

          <div class="grade-nav">
            <button class="grade-btn" data-grade="1">1年生</button>
            <button class="grade-btn" data-grade="2">2年生</button>
            <button class="grade-btn" data-grade="3">3年生</button>
            <button class="grade-btn" data-grade="4">4年生</button>
            <button class="grade-btn" data-grade="5">5年生</button>
            <button class="grade-btn" data-grade="6">6年生</button>
          </div>

          <div id="kanjiGrid" class="kanji-grid hidden"></div>
        </div>
      </aside>

      <main class="main-content">
        <div id="results" class="results hidden">
          <div class="results-columns">
            <div class="results-primary">
              <div class="section">
                <div class="mode-header">
                  <h3 id="canvasTitle">アニメーション</h3>
                  <button id="modeToggleBtn" class="mode-toggle-btn" title="モードきりかえ">✏ なぞる</button>
                </div>
                <div id="animationWrap">
                  <div id="animationCanvas" class="animation-canvas"></div>
                </div>
                <div id="traceArea" class="trace-area hidden">
                  <div id="traceCanvas" class="trace-canvas"></div>
                  <div class="trace-info">
                    <span id="traceCounter" class="trace-counter"></span>
                    <button id="traceRetryBtn" class="trace-retry-btn hidden">もういちど</button>
                  </div>
                  <div id="traceMessage" class="trace-message hidden"></div>
                </div>
              </div>

              <div class="section">
                <h3>かきじゅん</h3>
                <div id="steps" class="steps-grid"></div>
              </div>
            </div>

            <div class="results-side">
              <div class="section">
                <h3>よみかた</h3>
                <div id="readings" class="readings"></div>
              </div>

              <div class="section">
                <h3>この漢字をつかうことば</h3>
                <div id="words" class="words-list"></div>
              </div>

              <div class="section">
                <h3>れんしゅうシート</h3>
                <div class="practice-options">
                  <button id="printBtn">いんさつ</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div id="printView" class="print-view hidden">
          <p class="print-view-note">プレビューを みてから したの いんさつを おしてね</p>
          <div class="print-view-actions">
            <button id="printBackInlineBtn" class="app-footer-btn is-secondary" type="button">かんじにもどる</button>
            <button id="printNowInlineBtn" class="app-footer-btn is-accent" type="button">いんさつする</button>
          </div>
          <div class="print-view-sheet-wrap">
            <div id="printPreviewSheet" class="print-preview-sheet"></div>
          </div>
        </div>

        <div id="aboutView" class="data-info-view hidden">
          <div class="data-info-card">
            <h2>このアプリについて</h2>
            <h3>ミッション</h3>
            <p>このアプリは、日本の小学生や先生が、学校やおうちで漢字をすばやく調べて、読み方や書き順、練習のしかたをすぐに確かめられるようにするための無料アプリです。どうぞ気軽に使ってください。よかったら、お友だちや先生にも知らせてもらえたらうれしいです。</p>
            <p>このアプリは、小学校で日本語を学んでいる2人の子どもの父親が作り、今も少しずつよくしています。もともとは自分の子どもたちのために作りはじめましたが、今は日本語を学ぶほかの子どもたちにも役立ててもらえたらと思っています。</p>
          </div>

          <div class="data-info-card">
            <h3>データとライセンス</h3>
            <p><a href="https://github.com/KanjiVG/kanjivg" target="_blank" rel="noreferrer"><strong>KanjiVG</strong></a> は、かきじゅんの データです。ライセンスは CC BY-SA 3.0 です。</p>

            <p><a href="https://github.com/onlyskin/kanjiapi.dev" target="_blank" rel="noreferrer"><strong>kanjiapi.dev</strong></a> は、漢字や ことばの じょうほうの もとです。リポジトリは MIT License です。</p>

            <p><a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noreferrer"><strong>EDRDG</strong></a> の <a href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project" target="_blank" rel="noreferrer"><strong>JMdict</strong></a> と <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noreferrer"><strong>KANJIDIC2</strong></a> に もとづく データを ふくみます。ライセンスは CC BY-SA 4.0 です。</p>
          </div>
        </div>

        <div id="privacyView" class="data-info-view hidden">
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

        <div id="termsView" class="data-info-view hidden">
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

        <div id="emptyState" class="empty-state">
          <p id="emptyStateMessage">がくねんを えらんで かんじを おしてね</p>
        </div>
      </main>
    </div>

    <footer class="app-footer">
      <div id="footerActions" class="app-footer-actions"></div>
      <div id="footerMetaLinks" class="app-footer-meta-links"></div>
    </footer>
  </div>
`;

export default appShell;
