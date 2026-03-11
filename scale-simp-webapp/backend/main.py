# Back-end implementation of questionnaire simplification app

# Frontend - Backend Communication
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from fastapi.middleware.cors import CORSMiddleware

# Core simplification
import pandas as pd
from umap import UMAP
import hdbscan
from sklearn.feature_extraction.text import CountVectorizer
from bertopic import BERTopic
from bertopic.vectorizers import ClassTfidfTransformer
from sklearn.manifold import TSNE
import openai
from bertopic.backend import OpenAIBackend


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SimplifyRequest(BaseModel):
    sentences: List[str]
    api_key: Optional[str] = None
    base_url: Optional[str] = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    model_name: Optional[str] = "text-embedding-v4"
    nr_topics: Optional[int] = 5
    umap_n_neighbors: Optional[int] = 3
    hdbscan_min_cluster_size: Optional[int] = 2
    hdbscan_min_samples: Optional[int] = 1
    pick_per_topic: Optional[int] = 2

class TopicItem(BaseModel):
    question: str
    topic: int
    probability: float
    cosine: Optional[float] = None
    ctfidf: Optional[float] = None

class KeywordItem(BaseModel):
    word: str
    score: float

class TopicSummary(BaseModel):
    topic_id: int
    top_keywords: List[KeywordItem]
    representative_question: str
    confidence: float


class PointItem(BaseModel):
    qid: str
    index: int
    topic: int
    x: float
    y: float
    prob: float


class SimplifyResponse(BaseModel):
    items: List[TopicItem]
    summaries: List[TopicSummary]
    points: List[PointItem]  
    selected_qids: List[str] = []


@app.post("/simplify", response_model=SimplifyResponse)
def simplify(req: SimplifyRequest):
    # 1) Constructing embedding backend
    client = openai.OpenAI(api_key=req.api_key or "sk-123456", base_url=req.base_url)
    embedding_model = OpenAIBackend(client, req.model_name, batch_size=10)

    # 2) Generate embeddings
    sentences = req.sentences
    embeddings = embedding_model.embed(sentences)

    # 3) Dimension reduction
    umap_model = UMAP(
        n_neighbors=req.umap_n_neighbors,
        n_components=5,
        min_dist=0.0,
        metric="cosine",
        random_state=42,
    )
    hdbscan_model = hdbscan.HDBSCAN(
        min_cluster_size=req.hdbscan_min_cluster_size,
        min_samples=req.hdbscan_min_samples,
        metric="euclidean",
        prediction_data=True,
    )
    vectorizer_model = CountVectorizer(stop_words="english")
    ctfidf_model = ClassTfidfTransformer()

    topic_model = BERTopic(
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        vectorizer_model=vectorizer_model,
        ctfidf_model=ctfidf_model,
        embedding_model=embedding_model,
        nr_topics='auto' if req.nr_topics==0 else req.nr_topics,
        top_n_words=5,
    )

    # 4) Fit and transform embeddings into topics
    topics, probs = topic_model.fit_transform(sentences, embeddings)

    # 5) Generate point coordinates using tsne
    n = embeddings.shape[0]
    perplexity = min(30, max(5, (n - 1) // 3))
    tsne_2d = TSNE(
        n_components=2,
        perplexity=perplexity,
        init="pca",
        learning_rate="auto",
        metric="cosine",
        random_state=42
    )
    xy = tsne_2d.fit_transform(embeddings)

    # 6) Simplification report
    df = pd.DataFrame({"Question": sentences, "Topic": topics, "Probability": probs})
    reps = (
        df[df["Topic"] != -1]
        .sort_values("Probability", ascending=False)
        .groupby("Topic").first().reset_index()
        .rename(columns={"Question": "Representative Question", "Probability": "Confidence"})
    )

    summaries: List[TopicSummary] = []
    for topic_id in reps["Topic"]:
        pairs = topic_model.get_topic(topic_id)  # [(word, score), ...] or None
        summaries.append(
            TopicSummary(
                topic_id=int(topic_id),
                top_keywords=[KeywordItem(word=w, score=float(s)) for (w, s) in (pairs or [])],
                representative_question=reps.loc[reps["Topic"] == topic_id, "Representative Question"].values[0],
                confidence=float(reps.loc[reps["Topic"] == topic_id, "Confidence"].values[0]),
            )
        )

    items = [
        TopicItem(question=row["Question"], topic=int(row["Topic"]), probability=float(row["Probability"]))
        for _, row in df.iterrows()
    ]

    # 7) Visualization 
    points: List[PointItem] = []
    for i, (t, (x, y)) in enumerate(zip(topics, xy)):
        points.append(PointItem(
            qid=f"Q{i+1}",
            index=i,
            topic=int(t),
            x=float(x),
            y=float(y),
            prob=float(probs[i] if probs is not None else 0.0),
        ))
    
    selected_qids: List[str] = []

    k = int(getattr(req, "pick_per_topic", 1) or 1) 
    k = max(1, min(k, 10))  # Avoid extreme values

    # Pick the top k items by probability (ignore the outlier points)
    df_valid = df[df["Topic"] != -1].copy()
    df_topk = (
        df_valid.sort_values("Probability", ascending=False)
        .groupby("Topic")
        .head(k)
    )

    # Use index to map Qid
    selected_qids = [f"Q{idx+1}" for idx in df_topk.index.tolist()]



    return SimplifyResponse(items=items, summaries=summaries, points=points, selected_qids=selected_qids)


# Visualization Codes
from typing import Tuple
import io, base64
import matplotlib
matplotlib.use("Agg") 
import matplotlib.pyplot as plt
import numpy as np
from scipy.spatial import ConvexHull
from matplotlib.patches import Ellipse


class PlotPoint(BaseModel):
    qid: str
    topic: int
    x: float
    y: float

class PlotRequest(BaseModel):
    points: List[PlotPoint]
    selected_qids: List[str] = [] 
    width: int = 1000
    height: int = 750
    dpi: int = 150

@app.post("/plot2d")
def plot_2d(req: PlotRequest):
    pts = req.points
    if not pts:
        return {"image_base64": ""}

    xs = np.array([p.x for p in pts], dtype=float)
    ys = np.array([p.y for p in pts], dtype=float)
    topics = np.array([p.topic for p in pts], dtype=int)
    qids = np.array([p.qid for p in pts], dtype=str)

    selected_set = set(req.selected_qids or [])

    # Color the items by topic
    palette = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
               "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"]

    def color_for_topic(t: int) -> str:
        if t == -1:
            return "#9ca3af"  # outlier 灰
        return palette[t % len(palette)]

    # Draw the border of each topic
    def draw_topic_boundary(ax, pts_xy: np.ndarray, color: str, ellipse_n_std: float = 1.3):
        k = pts_xy.shape[0]
        if k < 2:
            return

        # convex hull / line
        if k >= 3:
            hull = ConvexHull(pts_xy)
            poly = pts_xy[hull.vertices]
            poly = np.vstack([poly, poly[0]])
            ax.plot(poly[:, 0], poly[:, 1], color=color, linewidth=1.6, alpha=0.95)
            ax.fill(poly[:, 0], poly[:, 1], color=color, alpha=0.06)
        else:
            ax.plot(pts_xy[:, 0], pts_xy[:, 1], color=color, linewidth=1.6, alpha=0.95)

        # ellipse
        if k >= 3:
            cov = np.cov(pts_xy.T)
            if np.linalg.matrix_rank(cov) == 2:
                mean = pts_xy.mean(axis=0)
                vals, vecs = np.linalg.eigh(cov)
                order = vals.argsort()[::-1]
                vals, vecs = vals[order], vecs[:, order]
                theta = np.degrees(np.arctan2(vecs[1, 0], vecs[0, 0]))
                width, height = 2 * ellipse_n_std * np.sqrt(vals)

                ell_fill = Ellipse(mean, width, height, angle=theta,
                                   facecolor=color, edgecolor="none", alpha=0.05)
                ax.add_patch(ell_fill)

                ell_edge = Ellipse(mean, width, height, angle=theta,
                                   fill=False, edgecolor=color, linewidth=1.4, alpha=0.95)
                ax.add_patch(ell_edge)

    fig_w_in = req.width / req.dpi
    fig_h_in = req.height / req.dpi
    fig, ax = plt.subplots(figsize=(fig_w_in, fig_h_in), dpi=req.dpi)

    # Draw topic border
    for t in sorted(set(topics.tolist())):
        if t == -1:
            continue
        mask = topics == t
        pts_xy = np.vstack([xs[mask], ys[mask]]).T
        draw_topic_boundary(ax, pts_xy, color=color_for_topic(int(t)), ellipse_n_std=1.3)

        # topic number
        center = pts_xy.mean(axis=0)
        ax.text(center[0], center[1], f"{t}", fontsize=10, fontweight="bold", alpha=0.9)

    # Draw item points
    colors = [color_for_topic(int(t)) for t in topics.tolist()]
    ax.scatter(xs, ys, c=colors, s=55, alpha=0.88, edgecolors="black", linewidths=0.4, zorder=3)

    # Add item id (Qid)
    dx = (xs.max() - xs.min()) * 0.01 if xs.max() > xs.min() else 0.5
    dy = (ys.max() - ys.min()) * 0.002 if ys.max() > ys.min() else 0.2
    for x, y, q in zip(xs, ys, qids):
        ax.text(x + dx, y + dy, q, fontsize=8, alpha=0.95, zorder=5)

    # Draw the red circle to denote the selected items
    sel_mask = np.array([q in selected_set for q in qids], dtype=bool)
    if sel_mask.any():
        ax.scatter(xs[sel_mask], ys[sel_mask],
                   s=160, facecolors="none", edgecolors="red", linewidths=2.6,
                   alpha=1.0, zorder=6)

    # Axis style
    ax.grid(True, linestyle="--", alpha=0.25)
    ax.set_xlabel("Dimension-1")
    ax.set_ylabel("Dimension-2")

    pad_x = (xs.max() - xs.min()) * 0.08 if xs.max() > xs.min() else 1.0
    pad_y = (ys.max() - ys.min()) * 0.08 if ys.max() > ys.min() else 1.0
    ax.set_xlim(xs.min() - pad_x, xs.max() + pad_x)
    ax.set_ylim(ys.min() - pad_y, ys.max() + pad_y)

    plt.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode("ascii")
    return {"image_base64": b64}

