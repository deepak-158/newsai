from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from db.sqlite import connect_to_sqlite, close_sqlite_connection
from services.background_tasks import start_background_loop
from services.news_service import fetch_news_api
from ai.rag_pipeline import retrieve_context
from ai.llama_inference import generate_summary, generate_chat_response
from db.redis_cache import get_cache, set_cache
import ai.faiss_store as faiss_store

app = FastAPI(title="ET IntelliSphere API")

# Setup CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_db_client():
    connect_to_sqlite()
    start_background_loop()

@app.on_event("shutdown")
async def shutdown_db_client():
    close_sqlite_connection()

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    query: str
    history: list[ChatMessage] = []

class SummarizeRequest(BaseModel):
    url: str
    title: str
    description: str
    vernacular: bool = False

@app.get("/news")
async def get_news(role: str = "Investor", country: str = None, search: str = None):
    if role.lower() == "founder":
        query = "business OR startup OR vc"
    elif role.lower() == "student":
        query = "business OR learning OR career"
    else:
        query = "business OR finance"
        
    articles = fetch_news_api(query, country=country, search_term=search, max_results=10)
    return {"status": "success", "articles": articles}

@app.post("/summarize")
async def summarize_article(req: SummarizeRequest):
    # Tier 1: In-memory / Redis cache
    cache_key = f"summary_{req.url}_{req.vernacular}"
    cached = get_cache(cache_key)
    if cached:
        return {"summary": cached, "cached": True}
        
    # Tier 2: SQLite database caching
    from db.sqlite import get_summary_from_db, save_summary_to_db
    import json
    db_cached = get_summary_from_db(req.url, req.vernacular)
    if db_cached:
        set_cache(cache_key, db_cached, expiration=86400)
        return {"summary": db_cached, "cached": True}
        
    # Tier 3: LLaMA generation
    # Use RAG to get relevant context (reduced to top 2 for speed)
    context = retrieve_context(f"{req.title}. {req.description}", top_k=2)
    if not context.strip():
        context = f"{req.title}. {req.description}"
        
    try:
        summary_obj = generate_summary(context, vernacular=req.vernacular)
        set_cache(cache_key, summary_obj, expiration=86400)
        save_summary_to_db(req.url, req.vernacular, json.dumps(summary_obj))
        return {"summary": summary_obj, "cached": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat_copilot(req: ChatRequest):
    from fastapi.responses import StreamingResponse
    from ai.llama_inference import generate_chat_stream
    
    context = retrieve_context(req.query, top_k=2)
    history_payload = [{"role": m.role, "content": m.content} for m in req.history]
    
    return StreamingResponse(
        generate_chat_stream(req.query, context, history_payload),
        media_type="text/plain",
        headers={"X-Context-Used": str(bool(context))}
    )

@app.get("/story")
async def get_grouped_story(title: str):
    """
    Find related articles using cosine similarity.
    """
    from ai.embeddings import get_embedding
    emb = get_embedding(title)
    
    # Ensure vector passes dimensionality check
    if not emb:
        return {"related": []}
        
    results = faiss_store.search(emb, top_k=5)
    
    # Filter out identical titles
    related = [r for r in results if r['metadata'].get('title') != title]
    return {"related": related}
