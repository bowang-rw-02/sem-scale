import React, { useMemo, useState } from "react";

//Front-end implementation of Questionnaire Simplification app

type TopicItem = {
  question: string;
  topic: number;
  probability: number;
};

type TopicSummary = {
  topic_id: number;
  top_keywords: { word: string; score: number }[];
  representative_question: string;
  confidence: number;
};

type APIPoint = {
  qid: string;
  index: number;
  topic: number;
  x: number;
  y: number;
  prob: number;
};

type SimplifyResponse = {
  items: TopicItem[];
  summaries: TopicSummary[];
  points?: APIPoint[];
  selected_qids?: string[];
};

export default function QuestionnaireSimplifierApp() {
  // Default input
  const [rawText, setRawText] = useState<string>("");

  // Item prefix (optional)
  const [prefix, setPrefix] = useState<string>("");

  // Pre-processed result
  const [preprocessedText, setPreprocessedText] = useState<string>("");

  // Pre-processed texts for backend 
  const [processedSentences, setProcessedSentences] = useState<string[]>([]);

  // Console output
  const [consoleLog, setConsoleLog] = useState<string[]>([
    "System ready. Please paste the questionnaire text and click 'Start Pre-processing'",
  ]);

  // Model settings
  const [apiKey, setApiKey] = useState<string>("");
  const [maxTopics, setMaxTopics] = useState<number>(4); // 0 denotes 'auto'
  const [pickPerTopic, setPickPerTopic] = useState<number>(4);

  const [neighbors, setNeighbors] = useState<number>(3);
  const [minClusterSize, setMinClusterSize] = useState<number>(2);
  const [minSamples, setMinSamples] = useState<number>(1);

  const [embeddingModel, setEmbeddingModel] = useState<string>("Qwen3-4B-Embedding");
  const [clusterAlgo, setClusterAlgo] = useState<string>("HDBScan");

  // Running status
  const [processed, setProcessed] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);

  // Output result (part three)
  const [resultRows, setResultRows] = useState<
    Array<{ topic: number; text: string; prob: number; keywords: string }>
  >([]);

  // Visualization
  const [vizStatus, setVizStatus] = useState<string>("");

  const [rawPlotPoints, setRawPlotPoints] = useState<Array<{ qid: string; topic: number; x: number; y: number }>>([]);
  const [vizImage, setVizImage] = useState<string>(""); // base64 PNG
  const [selectedQids, setSelectedQids] = useState<string[]>([]);


  function appendLog(msg: string) {
    const ts = new Date().toLocaleTimeString();
    setConsoleLog((prev) => [...prev, `[${ts}] ${msg}`]);
  }

  // Divided the input into items by lines
  const items = useMemo(
    () =>
      rawText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s, i) => ({ id: i, text: s })),
    [rawText]
  );

  function handlePreprocess() {
    appendLog("Start Preprocessing…");

    // Detect and delete the duplicate items
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const it of items) {
      if (!seen.has(it.text)) {
        seen.add(it.text);
        deduped.push(it.text);
      }
    }

    const cleanPrefix = (prefix || "").trim();
    const finalSentences = deduped.map((s) => (cleanPrefix ? `${cleanPrefix} ${s}` : s));

    setProcessedSentences(finalSentences);
    setPreprocessedText(finalSentences.join("\n"));

    setProcessed(true);
    appendLog(`Preprocessing complete: Enter ${items.length} Lines → Keep ${deduped.length} Lines after deduplication.`);
    if (cleanPrefix) appendLog(`Prefix applied: "${cleanPrefix}"`);
  }

  async function handleRun() {
    if (!processed || processedSentences.length === 0) return;

    setRunning(true);
    appendLog("Start one-click run: Calling backend /simplify …");
    setVizStatus("");
    setVizImage("");

    try {
      const body: any = {
        sentences: processedSentences,
        api_key: apiKey || "sk-xxxxxx",
        model_name: "text-embedding-v4",
        umap_n_neighbors: neighbors,
        hdbscan_min_cluster_size: minClusterSize,
        hdbscan_min_samples: minSamples,
        nr_topics: maxTopics > 0 ? maxTopics : null,
        pick_per_topic: pickPerTopic,
      };

      const resp = await fetch("http://localhost:8000/simplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data: SimplifyResponse = await resp.json();
      appendLog(
        `Backend returns: items=${data.items.length}, topics=${data.summaries.length}, points=${(data.points || []).length}`
      );
      // Keep the final selected item numbers by backend for visualization
      setSelectedQids(data.selected_qids || []);


      // Output result summaries
      const summariesSorted = [...data.summaries].sort((a, b) => a.topic_id - b.topic_id);

      const rows: Array<{ topic: number; text: string; prob: number; keywords: string }> = [];



      // Save original coordinates of the data points
      setRawPlotPoints(
        (data.points || []).map((p: any) => ({ qid: p.qid, topic: p.topic, x: p.x, y: p.y }))
      );

      // Reset hint of visualization
      setVizImage("");
      setVizStatus("Click the 'Visualization' button above to generate the visualization (PNG format)");

      for (const s of summariesSorted) {
        const keywords = (s.top_keywords || [])
          .slice(0, 6)
          .map((k) => `${k.word} (${k.score.toFixed(3)})`)
          .join(", ");

        // Find the representative questions
        rows.push({
          topic: s.topic_id,
          text: s.representative_question,
          prob: s.confidence,
          keywords,
        });
        

        // If the user needs to pick more than one question/topic, select the target items by their probabilities in a descend order
        if (pickPerTopic > 1) {
          const candidates = data.items
            .filter((it) => it.topic === s.topic_id)
            .sort((a, b) => b.probability - a.probability);

          const need = pickPerTopic - 1;
          const picked = new Set<string>([s.representative_question]);

          for (const c of candidates) {
            if (rows.filter((r) => r.topic === s.topic_id).length >= pickPerTopic) break;
            if (picked.has(c.question)) continue;
            picked.add(c.question);
            rows.push({
              topic: s.topic_id,
              text: c.question,
              prob: c.probability,
              keywords,
            });
          }

          // If still not sufficient, keep the current situation
        }
      }

      // Sort the result: topic: ascending order; within topic: descending order
      rows.sort((a, b) => (a.topic !== b.topic ? a.topic - b.topic : b.prob - a.prob));

      setResultRows(rows);
      appendLog("One-click run completed. Results updated. ");
    } catch (err: any) {
      appendLog(`Error, info: ${err?.message || String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  async function handleVisualize() {
    try {
      if (rawPlotPoints.length === 0) {
        setVizStatus("No data available for visualization, please click 'One-click operation' first.");
        return;
      }
      setVizStatus("Generating visualizations...");
      setVizImage("");

      const resp = await fetch("http://localhost:8000/plot2d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          points: rawPlotPoints,
          selected_qids: selectedQids,
          width: 1000,   // 4:3
          height: 750,
          dpi: 150,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const b64 = (data.image_base64 || "").trim();
      const dataUrl = b64.startsWith("data:image")
        ? b64
        : `data:image/png;base64,${b64}`;

      setVizImage(dataUrl);
      setVizStatus("Visualization sucessfully completed: 4:3 PNG");

    } catch (err: any) {
      setVizStatus(`Visualization failed, info: ${err.message || err}`);
    }
  }

  const disabledRun = running || !processed || processedSentences.length === 0;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl md:text-2xl font-semibold">One-Click Psychological Scale Simplification Tool</h1>
          <div className="text-sm text-neutral-500">V1.0</div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Part 1 Scale Text Input and Pre-processing */}
        <section className="col-span-1 lg:col-span-2">
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="p-4 md:p-6 border-b border-neutral-100">
              <h2 className="text-lg font-semibold">Part 1 · Scale Text Input and Pre-processing</h2>
            </div>

            <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Questionnaire Item Text Input Box</label>
                <textarea
                  className="w-full h-44 md:h-56 rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 p-3"
                  placeholder={"Tip: Please paste the scale items and separate by lines.E.g.: \nI feel happy.\nI am a hard worker.\nI am a cheerful person."}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                />

                {/* Question Prefix */}
                <div className="mt-3">
                  <label className="block text-sm font-medium mb-2">Question Prefix: (optional)</label>
                  <input
                    className="w-full rounded-xl border border-neutral-300 px-3 py-2"
                    placeholder={`E.g., Indicate how much this statement describes you:`}
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    The pre-processing process adds this prefix to each item for the later topic modeling. 
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    onClick={handlePreprocess}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-60"
                    disabled={items.length === 0}
                  >
                    Start Pre-processing
                  </button>
                  <span className="text-sm text-neutral-600">
                    {processed ? "Pre-processing complete." : "Waiting for pre-processing ..."}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Item Pre-processing Result</label>
                <div className="h-44 md:h-56 w-full rounded-xl border border-dashed border-neutral-300 p-3 overflow-auto bg-neutral-50">
                  <p className="text-sm text-neutral-600 whitespace-pre-wrap">
                    {preprocessedText || "(The pre-processed item texts will be displayed here)"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Console Information */}
        <section className="col-span-1 lg:col-span-2">
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="p-4 md:p-6 border-b border-neutral-100">
              <h2 className="text-lg font-semibold">Console Information</h2>
            </div>
            <div className="p-4 md:p-6">
              <div className="h-40 md:h-48 w-full rounded-xl border border-dashed border-neutral-300 p-3 overflow-auto bg-neutral-50">
                <p className="text-sm text-neutral-600 whitespace-pre-wrap">{consoleLog.join("\n")}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Part 2 Model Settings */}
        <section className="col-span-1 lg:col-span-2">
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="p-4 md:p-6 border-b border-neutral-100">
              <h2 className="text-lg font-semibold">Part 2 · Model and Parameter Settings</h2>
            </div>

            <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Number of Topics (max)</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={maxTopics}
                  onChange={(e) => setMaxTopics(Number(e.target.value))}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  Tip: number of factors N is known: recommended to fill in "N" or "N+1" to leave some redundancy; filling in "0": algorithm will determine topic numbers automatically.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Number of Representative Items Per Topic</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={pickPerTopic}
                  onChange={(e) => setPickPerTopic(Number(e.target.value))}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Embedding Model API Key</label>
                <input
                  type="password"
                  placeholder="Format: sk-xxx"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Embedding Model Selection</label>
                <select
                  value={embeddingModel}
                  onChange={(e) => setEmbeddingModel(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 bg-white"
                >
                  <option>Qwen3-4B-Embedding</option>
                  <option>all-mpnet-base-v2</option>
                  <option>bge-large-zh-v1.5</option>
                </select>
                <p className="text-xs text-neutral-500 mt-1">
                  Current online version uses Aliyun text-­embedding-v4 for demonstration. Results and figure may slightly vary from offline version.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Clustering Algorithm Selection</label>
                <select
                  value={clusterAlgo}
                  onChange={(e) => setClusterAlgo(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-3 py-2 bg-white"
                >
                  <option>HDBScan</option>
                  <option>KMeans</option>
                  <option>Agglomerative</option>
                </select>
                <p className="text-xs text-neutral-500 mt-1">
                  Default: HDBSCAN
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">UMAP n_neighbors</label>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={neighbors}
                    onChange={(e) => setNeighbors(Number(e.target.value))}
                    className="w-full rounded-xl border border-neutral-300 px-2 py-2"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                  Advanced parameter 1, keep the default setting if you don't know the meaning. 
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">HDBSCAN min_cluster_size</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={minClusterSize}
                    onChange={(e) => setMinClusterSize(Number(e.target.value))}
                    className="w-full rounded-xl border border-neutral-300 px-2 py-2"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                  Advanced parameter 2
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">HDBSCAN min_samples</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={minSamples}
                    onChange={(e) => setMinSamples(Number(e.target.value))}
                    className="w-full rounded-xl border border-neutral-300 px-2 py-2"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                  Advanced parameter 3
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Part 3 Simplification */}
        <section className="col-span-1 lg:col-span-2">
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="p-4 md:p-6 border-b border-neutral-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Part 3 · Scale Simplification</h2>
              <button
                onClick={handleRun}
                disabled={disabledRun}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-60"
              >
                One-Click Run
              </button>
            </div>

            <div className="p-4 md:p-6">
              <label className="block text-sm font-medium mb-2">Simplified Result Output</label>
              <div className="h-72 rounded-xl border border-neutral-200 bg-neutral-50 p-3 overflow-auto">
                {resultRows.length === 0 ? (
                  <p className="text-neutral-500 text-sm">
                    There are no results yet. Please complete the "Pre-processing" step first, and then click "One-click Run". The keywords and representative items for each topic will be displayed here. 
                  </p>
                ) : (
                  <div className="space-y-4">
                    {groupByTopic(resultRows).map((g) => (
                      <div key={g.topic} className="rounded-xl border border-neutral-200 bg-white p-3">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold">Topic {g.topic}</div>
                        </div>
                        <div className="text-xs text-neutral-500 mt-1">
                          Keywords: {g.keywords || "(None)"}
                        </div>
                        <div className="mt-2">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-neutral-500">
                                <th className="py-1 pr-2">Representative Item</th>
                                <th className="py-1 pr-2">Confidence</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.items.map((r, idx) => (
                                <tr key={idx} className="border-t border-neutral-200">
                                  <td className="py-1 pr-2">{r.text}</td>
                                  <td className="py-1 pr-2">{r.prob.toFixed(3)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Part 4 Visualization */}
        <section className="col-span-1 lg:col-span-2">
          <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm">
            <div className="p-4 md:p-6 border-b border-neutral-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Part 4 · Visualization</h2>
              <button
                onClick={handleVisualize}
                disabled={resultRows.length === 0}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-60"
              >
                Start Visualization
              </button>
            </div>

            <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Process Indicator</label>
                <div className="h-44 rounded-xl border border-dashed border-neutral-300 p-3 overflow-auto bg-neutral-50">
                  <p className="text-sm text-neutral-600">
                    {vizStatus || "Click the button above to generate the visualization"}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Visualization Image Output</label>
                <div className="h-64 rounded-xl border border-neutral-200 bg-white flex items-center justify-center overflow-hidden">
                  {vizImage ? (
                    <img src={vizImage} alt="viz" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-neutral-400 text-sm">No visualization data is available</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-6 text-xs text-neutral-500">
        Psychological Scale Simplification Tool V1.0
      </footer>
    </div>
  );
}

// Group the results by topic and display the keywords
function groupByTopic(
  rows: Array<{ topic: number; text: string; prob: number; keywords: string }>
) {
  const map = new Map<number, { topic: number; keywords: string; items: any[] }>();
  for (const r of rows) {
    if (!map.has(r.topic)) map.set(r.topic, { topic: r.topic, keywords: r.keywords, items: [] });
    map.get(r.topic)!.items.push({ text: r.text, prob: r.prob });
  }

  const grouped = Array.from(map.values()).sort((a, b) => a.topic - b.topic);
  for (const g of grouped) {
    g.items.sort((a, b) => b.prob - a.prob);
  }
  return grouped;
}
