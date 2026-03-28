# ET IntelliSphere - Technical Architecture & Implementation Details

## Overview
ET IntelliSphere is an AI-native news intelligence platform that provides dynamic story tracking, multi-article intelligence briefings, and a context-aware chat copilot. It utilizes a sophisticated hybrid AI routing system and Local RAG (Retrieval-Augmented Generation) to deliver highly personalized business insights based on the user's role (e.g., Investor, Founder, Student).

---

## 🏗️ Architecture Stack

### Frontend (User Interface)
- **Framework**: Next.js 16.2.1 (React) with Turbopack.
- **Styling**: Tailwind CSS v4 alongside a custom CSS Variable-based **Neumorphism** Design System.
- **Icons**: Lucide-React.
- **Theme**: Light & Dark mode toggle with persistent `localStorage`.
- **Key Features**: 
  - Dynamic Model Indicators to show which AI provider powered the response.
  - Streaming Chat UI for real-time AI responses.
  - Client-side settings management for API Keys (Gemini, Groq, OpenRouter).

### Backend (API & Inference Layer)
- **Framework**: FastAPI (Python).
- **Database**: SQLite for local persistence (tracking story arcs, caching summaries).
- **Cache**: Redis for rapid API response caching and NewsData results.
- **Vector Database**: FAISS (Facebook AI Similarity Search) for local, fast RAG vector storage.
- **News Source**: NewsData.io API integration for fetching real-time business and finance news.

---

## 🧠 AI Inference & Fallback Cascade
The platform ensures high reliability and cost-efficiency using a custom AI cascade fallback chain. If one service hits rate limits or goes offline, the system seamlessly falls back to the next available provider.

**The Fallback Chain:**
1. **Primary - Google Gemini (Cascade)**
   - Prioritizes speed and cost: `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-2.0-flash-lite` → `gemini-2.5-pro`.
2. **Secondary - Groq API**
   - Lightning-fast inference utilizing `llama-3.3-70b-versatile` ensuring negligible TTFT.
3. **Tertiary - OpenRouter API**
   - Deep fallback routing utilizing `google/gemini-2.0-flash-lite-preview-02-05:free`.
4. **Quaternary - Local Ollama**
   - Failsafe offline execution using `llama3:8b`.

*The frontend dynamically displays a badge (✦ Gemini, ⚡ Groq, 🌍 OpenRouter, 🦙 Ollama, or 📥 Cache) indicating which layer successfully served the request.*

---

## 🗃️ Local RAG (Retrieval-Augmented Generation)
- **Embeddings**: Uses `sentence-transformers` with the `all-MiniLM-L6-v2` model for lightweight, local vector embeddings (384 dimensions).
- **Vector Store**: FAISS index kept locally with a parallel JSON metadata store.
- **Chunking**: `RecursiveCharacterTextSplitter` from LangChain (chunk size: 400, overlap: 50).
- **Purpose**: Feeds related article context and historical timeline data into the context window for the AI Copilot, News Navigator, and Story Arc modules.

---

## 🎨 Neumorphism Design System
The frontend completely abandons traditional flat design or standard Tailwind utilities in favor of an immersive **Neumorphism** aesthetic.
- **Light Theme**: Soft white/gray backgrounds (`#e0e5ec`) with dark text, elevated shadows (`box-shadow: 20px 20px 40px #bec3c9, -20px -20px 40px #ffffff`).
- **Dark Theme**: Deep charcoal backgrounds (`#1a1e23`) with light text, using inverted shadow variables.
- **Components**: Includes `neu-card` (flat elevation), `neu-pressed` (inset/depressed elements), `neu-btn` (interactive hover/active states), and `neu-input` (inset text fields).

---

## 🔌 Core API Endpoints

### 1. `GET /news`
Fetches personalized news based on user role (e.g., "business OR finance" vs "business OR startup OR vc").

### 2. `POST /summarize`
Generates a 9-point structured intelligence brief including:
- 2-sentence summary
- Market impact & Risks
- Actionable insight & Contrarian view
- Decision Signal (Verdict + Confidence score)

### 3. `POST /navigator`
Takes a target article and uses FAISS to find the top 5 related articles. It then merges their content and generates a **Unified Intelligence Briefing** to highlight conflicting signals and broader market trends.

### 4. `POST /story-arc`
Tracks how a given news topic has evolved over time. Retrieves historical context from SQLite/FAISS and outputs a timeline, sentiment shift, and key turning points.

### 5. `POST /chat` (Streaming)
WebSocket/SSE stream endpoint. Takes user queries and leverages FAISS RAG to inject the active article context and conversation history. Streams chunks back to the client, prepended with a `__MODEL:Name__` tag for frontend tracking.

---

## ⚙️ Configuration & Environment (Backend `.env`)
The system depends on the following environment variables (configurable via `.env` or the frontend Settings UI):
- `GEMINI_API_KEY`: Primary AI provider
- `HF_TOKEN`: Secondary fallback provider
- `NEWSDATA_API_KEY`: News fetching
- `OLLAMA_BASE_URL`: Local LLM endpoint (default: `http://localhost:11434`)
- `REDIS_URI`: Cache connection
- `SQLITE_DB_PATH`: Database file path
- `FAISS_INDEX_PATH`: Vector index file path

---

## 💻 Frontend State Management & API Integration
The Next.js 16 frontend employs React hooks (`useState`, `useEffect`) and native `fetch` combined with SSE (Server Sent Events) for state management.
- **Polling & Caching**: Data fetching relies on client-side functions resolving promises, utilizing the backend caching layer to avoid excessive render loops.
- **Provider Settings Panel**: API Keys (Gemini and HuggingFace tokens) are managed securely from the frontend settings panel, making a request to the `/api/config` backend endpoint to persist `HF_TOKEN` and `GEMINI_API_KEY` into the `.env` file at runtime. This avoids hard-restarts during configuration changes.
- **Model Tracking**: Every chat or AI operation receives metadata about the exact inference model used, enabling the frontend to render dynamic UI badges detailing the specific engine responsible for the completion.

---

## 🚀 Future Enhancements Roadmap
- **Production Persistence**: Migrate from SQLite to PostgreSQL / Supabase.
- **Vector Search Refinement**: Replace local FAISS with a managed vector store like Pinecone for higher scale.
- **Streaming Summaries**: Convert the Navigator briefing endpoint to a WebSocket stream for TTFT (Time-to-first-token) optimization.
