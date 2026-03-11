# Response-Free Semantic Scale Simplification

This repository contains the official implementation of:

_"Discovering Semantic Latent Structures in Psychological Scales: A Response-Free Pathway to Efficient Simplification"_

A lightweight web-based tool for **response-free psychological scale simplification**.  
The system takes questionnaire item texts as input, performs semantic encoding, clustering, topic modeling, and representative-item selection, and then returns a simplified short form together with topic summaries and a visualization.

(This release is the **online demo version** of the system. To keep deployment lightweight, the default text encoder uses the **Qwen3 embedding API** instead of the local **[Qwen3-embedding-4B](https://huggingface.co/Qwen/Qwen3-Embedding-4B)** model. A pure local-model version corresponding to the paper setup will be released soon separately.)

---

## Interface Preview
#### Idle
<img src=".\figures\idle-part12-preview.jpg">
<img src=".\figures\idle-part34-preview.jpg">

#### Working
<img src=".\figures\working-part12-preview.jpg">
<img src=".\figures\working-part34-preview.jpg">


---

## Workflow and Features

- User inputs questionnaire items directly in the browser webpage
- Optionally add a shared item prefix before analysis
- Framework performs semantic clustering and topic-based simplification without additional respondent data
- Output representative items for each discovered topic
- Visualize the semantic structure of the questionnaire in 2D

---

## Project Structure

```text
scale-simp-webapp/
├─ backend/                  # FastAPI backend (main service code in backend/main.py)
├─ public/
├─ src/                      # Frontend source code (main UI code in src/)
├─ .gitignore
├─ eslint.config.js
├─ index.html
├─ package.json
├─ package-lock.json
├─ postcss.config.js
├─ tailwind.config.js
├─ tsconfig.app.json
├─ tsconfig.json
├─ tsconfig.node.json
├─ vite.config.ts
└─ README.md
```

For clarity, this README only highlights the most important folders and entry files.  
Additional files inside `backend/` and `src/` are omitted here, as they are internal implementation details and are not required for basic installation or usage.

---

## Requirements

### 1. API Key of the Qwen Embedding Model

This version uses the **Qwen online embedding API** by default.  
Please register for an Alibaba Cloud account and obtain an API key:

`https://www.alibabacloud.com/help/en/model-studio/apikey`

The API key can be entered directly in the web interface when the app is running. Default embedding model is already specified as "(Qwen3) text-embedding-v4", which costs less than $0.07/1M token.
(source: https://www.alibabacloud.com/help/en/model-studio/model-pricing)

### 2. Backend Environment

Recommended:

- **Anaconda or Miniconda** (strongly recommended)
- Python 3.12 or 3.11

We recommend using Anaconda/Miniconda because it allows users to create an isolated environment quickly and avoids many low-level dependency issues that may occur when installing scientific Python libraries manually.

Download links:

- Anaconda: `https://www.anaconda.com/download`
- Miniconda: `https://www.anaconda.com/docs/getting-started/miniconda/install`

### 3. Frontend Environment

Recommended:

- **Node.js LTS version**
- npm

The Node.js installer from the official website already includes **npm** in most standard installations.

Download link:

- Node.js: `https://nodejs.org/en/download`

Using the official **LTS installer** from the Node.js website is recommended for compatibility and stability.

---

## Installation

Before starting, please open a command-line terminal:

- **Windows**: Command Prompt, PowerShell, or Anaconda Prompt  
- **macOS / Linux**: Terminal

### Step 1. Obtain the project files

You can either:

1. **Clone the repository** via Git
2. **Download the project as a ZIP file** from GitHub and extract it manually

If using Git:

```bash
git clone https://github.com/bowang-rw-02/sem-scale
cd scale-simp-webapp
```

If using the ZIP download method, extract the folder and then navigate to the project root directory (`scale-simp-webapp`) in your terminal before continuing.

### Step 2. Create the Python environment

```bash
conda create -n sem-simp python=3.12 -y
conda activate sem-simp
```

### Step 3. Install backend dependencies

```bash
pip install -r requirements.txt
```

### Step 4. Install frontend dependencies

Since the frontend is located in the project root, run:

```bash
npm install
```

---

## Running the App

You need **two terminals**: one for the backend and one for the frontend.

### Terminal A: Start the backend

From the project root:

```bash
cd scale-simp-webapp
conda activate sem-simp
uvicorn backend.main:app --reload --port 8000
```

If the backend starts successfully, the API docs will be available at:

`http://127.0.0.1:8000/docs`

### Terminal B: Start the frontend

From the project root:

```bash
cd scale-simp-webapp
npm run dev
```

Vite will start the frontend development server and display a local URL, typically:

`http://localhost:5173/`

### Open the app in your browser

Visit:

`http://localhost:5173/`

---

## How to Use

(For a quick test, users may start with the provided DASS example file.)
1. Paste questionnaire items into the **Part 1 - Item Text Input** box, one item per line.
2. Optionally enter an **Item Prefix** if your questionnaire uses a shared instruction (for example: *"Indicate how much this statement describes you:"*).
3. Click **Start Pre-processing**.
4. Enter your API key in the **Part 2 - Embedding Model API Key**.
5. Adjust model settings such as:
   - number of topics
   - number of selected (representative) items per topic
   - embedding models, clustering algorithms (currently only qwen and hdbscan are implemented)
   - UMAP, HDBSCAN advanced parameters
6. Click **Part 3 - One-Click Run** to generate:
   - topic summaries
   - representative items
   - simplified short form result
7. Click **Part 4 - Start Visualization** to generate a 2D semantic plot.

---

## Notes

- This release is intended as a lightweight demonstration version.
- The default encoder uses the online Qwen embedding API rather than a local embedding model. The local model version code will be released soon.
- For reproducibility, please keep the frontend and backend running simultaneously during use.

---

## Troubleshooting

### The webpage opens, but clicking "Run" shows `Failed to fetch`

This usually means the backend is not running.

Please check:

1. Whether the backend terminal is active
2. Whether `http://127.0.0.1:8000/docs` can be opened in a browser
3. Whether the frontend and backend are both running from the correct project directory

### The visualization image is broken

Please make sure the backend `/plot2d` endpoint is running correctly and that the frontend is receiving a valid base64 PNG string.

### `npm run dev` fails

Make sure frontend dependencies were installed successfully:

```bash
npm install
```

### `uvicorn backend.main:app --reload --port 8000` fails

Make sure:

- you are in the project root directory
- the `sem-simp` environment is activated
- backend dependencies were installed via `pip install -r requirements.txt`

---

## Citation

If you use this tool in academic work, please cite the corresponding paper.

```text
@article{wang2026discovering,
      title={Discovering Semantic Latent Structures in Psychological Scales: A Response-Free Pathway to Efficient Simplification}, 
      author={Bo Wang and Yuxuan Zhang and Yueqin Hu and Hanchao Hou and Kaiping Peng and Shiguang Ni},
      year={2026},
      eprint={2602.12575},
      archivePrefix={arXiv},
      primaryClass={cs.CL},
      url={https://arxiv.org/abs/2602.12575}, 
      doi={10.48550/arXiv.2602.12575}
}
```

---

## License

This project is licensed under the Apache License 2.0.  
See the `LICENSE` file for details.

---

## Example Dataset

An example item file based on the DASS scale is provided for quick testing:

- `examples/dass_scale_items.txt`

Users can paste these items directly into the web interface to try the simplification workflow.

---

## References

The example dataset included in this repository is based on the DASS scale.  Please refer to the original publication and dataset source for details.

- Dass Paper: Lovibond, S. H. (1995). Manual for the depression anxiety stress scales. Sydney psychology foundation.

- Dass dataset: OpenPsychometrics.org. (2019). Depression anxiety stress scales (dass) raw data [Publicly available dataset].
https://openpsychometrics.org/_rawdata/DASS_data_21.02.19.zip

---

## Acknowledgements

This project builds on modern NLP and topic-modeling libraries, including FastAPI, UMAP, HDBSCAN, BERTopic, Vite, and Tailwind CSS.