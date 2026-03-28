# ET IntelliSphere 🌐

**ET IntelliSphere** is an advanced, hyper-personalized financial intelligence dashboard. It aggregates global business news and utilizes a local, private Large Language Model (LLM) to perform zero-latency financial analysis, risk assessment, and contextual chat interactions.

---

## 🏗️ Technology Stack

### Frontend UI
- **Framework**: Next.js 16 / React 19
- **Styling**: Tailwind CSS & Framer Motion (Glassmorphism & animated rendering)
- **Icons**: Lucide React
- **Data Fetching**: Asynchronous native Web Streams API (used for real-time ChatGPT-like text streaming)

### Backend API
- **Framework**: FastAPI (Python)
- **Database**: SQLite (Data persistence and background precomputation storage)
- **Caching**: Redis (In-memory instantaneous hot-cache)
- **External Integration**: NewsData.io API (For dynamically querying global country-specific financial news)

### AI & Machine Learning Layer
- **LLM Engine**: Ollama running `llama3:8b` locally completely offline and private.
- **Vector Database**: FAISS (Facebook AI Similarity Search) used for hyper-fast localized Retrieval-Augmented Generation (RAG).
- **Embeddings Pipeline**: `sentence-transformers/all-MiniLM-L6-v2` (Converts news articles into mathematical vectors).

---

## 🚀 Core Features

### 1. Role-Based Dynamic Feeds
Users select an initial persona (**Investor**, **Founder**, or **Student**). The backend dynamically alters its NewsData.io underlying query logic to pull news specifically tailored to that persona (e.g., Venture Capital news for founders vs. Market Rate developments for investors).

### 2. Geographic & Custom Topic Filtering
Built-in UI routing allows users to strict-filter the global news feed to specific countries (India, US, UK, Australia) and apply keyword searches directly to the live feed without hitting hard rate limits.

### 3. AI Executive Summaries
Clicking any article instantly generates an Intelligence Brief. Instead of forcing you to read a 10-paragraph article, the local LLaMA model strictly returns a JSON structure containing:
- 📌 **Executive Summary**
- 📉 **Market Impact**
- 🚨 **Potential Risks**
- 🔮 **Future Predictions**

### 4. Zero-Latency Precomputation Pipeline
Instead of waiting 10-15 seconds for an LLM to read an article every time you click one, ET IntelliSphere possesses an automated background worker. The server detects the top breaking news, autonomously asks LLaMA to summarize them, and permanently writes the results to SQLite. When you finally log in and click the article, it renders instantly in `0ms`.

### 5. Context Co-Pilot (Local RAG Chat)
A floating assistant living inside the interface. When you ask it a question (e.g., *"What is the risk here?"*), the system secretly attaches the title of the article you are actively reading. 
The backend breaks your question down, uses FAISS to find the most relevant contextual chunks of news data, and feeds it into the LLaMA model. Finally, the model streams the answer back to your frontend UI word-by-word with virtually no initial loading block!

### 6. Hinglish Translation Mode
A toggleable feature that alters the prompt instructions sent to the LLaMA parameters, forcing the AI to act as a conversational interpreter generating complex financial implications into easy-to-read "Hinglish".

### 7. Multi-Article News Navigator 🧠
Groups related articles via FAISS vector similarity and uses hybrid Gemini/LLaMA reasoning to generate a unified, broad-scope intelligence briefing. This enables users to see the larger narrative and overall market impact beyond a single isolated article.

### 8. Story Arc Tracker 📈
Analyzes chronological article data to track how a specific business story or trend evolves over time. It highlights key turning points, shifts in market sentiment, and provides clear future watch-points.

### 9. Hybrid Model Cascade & Rate Limiting
IntelliSphere dynamically cascades through Google Gemini models (Pro/Flash/Lite) for heavy reasoning tasks, gracefully falling back to local `llama3:8b` via Ollama if rate limits or network issues arise. Furthermore, critical endpoints are protected by an intelligent 5 requests/minute IP rate limiter to safely optimize cost allocation.

### 10. In-App System Configuration
Via a robust frontend Settings UI, users can securely configure the underlying global LLM keys without ever touching a code editor. Backend updates process synchronously with local `.env` rewriting and immediate zero-downtime hot reloading.

---

## ⚙️ How to Run Locally

You only need **one script** to boot the entire macro-architecture!

1. Open a terminal in the root project directory.
2. Run `.\start.bat` (or use `.\start.ps1` for PowerShell users).
3. The script will automatically trigger two isolated terminal sessions:
   - **Backend**: Activates the Python `venv` and runs Uvicorn on port `8000`.
   - **Frontend**: Runs the Next.js development server.

> [!IMPORTANT]
> **Prerequisites**: Ensure you have pulled the Ollama model to your machine prior to booting up for the AI systems to work. Open any terminal and run `ollama pull llama3:8b`.
