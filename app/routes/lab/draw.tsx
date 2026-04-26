import { createRoute } from "honox/factory";
import { DATA_VERSION } from "../../../src/version.js";
import DrawSearchLab from "../../islands/DrawSearchLab";

const RECOGNIZER_ASSET_VERSION = "v1.2-browser64";

export default createRoute((c) => {
  return c.render(
    <main class="draw-lab-page">
      <div class="draw-lab-inner">
        <header class="draw-lab-header">
          <a class="draw-lab-brand" href="/" rel="nofollow">
            kokugo.app
          </a>
          <div>
            <h1 class="draw-lab-title">てがきラボ</h1>
            <p class="draw-lab-subtitle">てがきでさがす・かけたかチェック</p>
          </div>
        </header>

        <DrawSearchLab
          dataVersion={DATA_VERSION}
          labelsUrl={`/api/recognizer-assets/labels.txt?v=${RECOGNIZER_ASSET_VERSION}`}
          modelUrl={`/api/recognizer-assets/model.tflite?v=${RECOGNIZER_ASSET_VERSION}`}
          wasmBaseUrl="/recognizer-wasm/"
        />
      </div>
    </main>,
    {
      title: "てがきラボ",
    },
  );
});
