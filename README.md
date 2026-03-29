# ET IntelliSphere 🚀

An AI-native personalized business news intelligence platform MVP.

## Tech Stack Overview
- **Frontend**: Next.js 15 App Router, TypeScript, TailwindCSS
- **Backend**: FastAPI, Python, SQLite
- **Local AI Engine**: Ollama (LLaMA3 Model), Langchain
- **Vector DB / RAG**: FAISS + sentence-transformers/all-MiniLM-L6-v2
- **Data Source**: GNews REST API (Free tier) with local fallback.
- **Audio/Video AI**: Piper TTS (Local Audio Briefings) & D-ID API (Video Anchors)

---

## 🛠️ Step 1: Environment Variables Setup

Create a `.env` file inside the `backend/` directory:
```env
# backend/.env
PROJECT_NAME="ET IntelliSphere"
SQLITE_DB_PATH="./data/intellisphere.db"
REDIS_URI="redis://localhost:6379"  # Optional, falls back to in-memory if redis server is missing
NEWSAPI_KEY="0b831692521147e5980b26e77ac18ffc" # Use your real NewsAPI key here
OLLAMA_BASE_URL="http://localhost:11434"
OLLAMA_MODEL="llama3"
FAISS_INDEX_PATH="./data/faiss_index"
```

No environment variables are required for the Next.js frontend locally since it proxies automatically (or hits `http://localhost:8000` via cross origin).

---

## 🦙 Step 2: Local LLaMA Setup (Ollama)

To run LLaMA 100% locally and free:
1. Download [Ollama](https://ollama.ai/) for Windows.
2. Open PowerShell/Terminal and pull the model:
   ```bash
   ollama run llama3
   ```
3. Keep the Ollama daemon running in the background. The API will be accessible at `http://localhost:11434`.

---

## ⚙️ Step 3: Backend Setup (FastAPI + AI Pipeline)

1. Ensure Python 3.9+ is installed.
2. Navigate to the backend directory:
   ```powershell
   cd "backend"
   python -m venv venv
   .\venv\Scripts\activate
   ```
3. Ensure all requirements are installed (we used `pip install fastapi uvicorn motor python-multipart sentence-transformers faiss-cpu requests langchain langchain-community redis` during setup phase).
4. Run the API Server:
   ```powershell
   uvicorn main:app --reload --port 8000
   ```
*(Note: on the first run, `sentence-transformers` handles downloading the `all-MiniLM-L6-v2` embedding weights. This will take ~90MB of space).*

---

## 💻 Step 4: Frontend Setup (Next.js)

1. Open a new Terminal/PowerShell and navigate to the frontend directory:
   ```powershell
   cd "frontend"
   ```
2. Run the development server:
   ```powershell
   npm run dev
   ```
3. Visit `http://localhost:3000` in your web browser.

---

## 🧪 Sample Prompts to Try in AI Co-Pilot

Once everything is running, click an article to generate its RAG AI Brief, and open the Chat Copilot (bottom right) to ask context-aware questions.

- *"What is a high-level summary of these events?"*
- *"Can you explain the main risk factors mentioned here in simple terms as if I am a student?"*
- *"How will this impact the tech-sector markets?"*
- *"Who are the main winners and losers in this news report?"*
- *"Should I change my investment strategy based on these findings?"*
