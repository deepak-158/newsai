from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from db.sqlite import connect_to_sqlite, close_sqlite_connection
from services.background_tasks import start_background_loop
from services.news_service import fetch_news_api
from ai.rag_pipeline import (
    retrieve_context, retrieve_related_articles, build_navigator_context,
    retrieve_story_timeline, build_timeline_context
)
from ai.llama_inference import (
    generate_summary, generate_chat_response, generate_navigator_brief,
    generate_story_arc, _call_with_fallback
)
from services.video_service import generate_avatar_video
from db.redis_cache import get_cache, set_cache
import ai.faiss_store as faiss_store
import time
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from services.audio_service import generate_audio as generate_audio_service
import os

class RateLimiterMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_requests: int = 5, window: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window = window
        self.clients = {}

    async def dispatch(self, request: Request, call_next):
        # Apply rate limiting only to AI generation endpoints
        if request.url.path not in ["/summarize", "/chat", "/navigator", "/story-arc"]:
             return await call_next(request)
        
        client_ip = request.client.host if request.client else "unknown"
        current_time = time.time()
        
        # Clean up old entries periodically to prevent memory leaks
        if len(self.clients) > 10000:
            self.clients.clear()
            
        client_data = self.clients.get(client_ip, {"count": 0, "start_time": current_time})
        
        if current_time - client_data["start_time"] > self.window:
            # Reset window
            client_data = {"count": 1, "start_time": current_time}
        else:
            client_data["count"] += 1
            if client_data["count"] > self.max_requests:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Maximum 5 requests per minute allowed."}
                )
                
        self.clients[client_ip] = client_data
        response = await call_next(request)
        return response

app = FastAPI(title="ET IntelliSphere API")

# Ensure audio directory exists and mount it
audio_dir = os.path.join(os.path.dirname(__file__), "audio")
os.makedirs(audio_dir, exist_ok=True)
app.mount("/audio", StaticFiles(directory=audio_dir), name="audio")

app.add_middleware(RateLimiterMiddleware)
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

# ── Request Models ──────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    query: str
    history: list[ChatMessage] = []
    article_context: str = ""   # Current article title + description
    user_role: str = ""         # Investor / Founder / Student

class SummarizeRequest(BaseModel):
    url: str
    title: str
    description: str
    vernacular: bool = False
    role: str = ""              # User role for personalized_impact

class NavigatorRequest(BaseModel):
    title: str
    description: str = ""

class StoryArcRequest(BaseModel):
    topic: str
    articles: list[dict] = []   # Optional: manually provided articles to track

class UpdateKeyRequest(BaseModel):
    api_key: str

class VideoRequest(BaseModel):
    article_id: str
    text: str = ""

class AudioRequest(BaseModel):
    article_id: str
    text: Optional[str] = ""

# ── Existing Endpoints ──────────────────────────────────────────────────────

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

# ── Settings Endpoints ──────────────────────────────────────────────────────

@app.get("/api/settings/gemini-key")
async def get_gemini_key():
    from core.config import settings
    key = settings.GEMINI_API_KEY
    # Check if key is set and not the hardcoded default one
    if key and key != "AIzaSyBKtM7pdaZC13EgGKwLkayQDWv_gf2DLPc":
        masked = key[:8] + "*" * (len(key) - 8) if len(key) > 8 else "***"
        return {"is_set": True, "masked_key": masked}
    return {"is_set": False, "masked_key": ""}

@app.post("/api/settings/gemini-key")
async def update_gemini_key(req: UpdateKeyRequest):
    from core.config import settings
    import os
    
    settings.GEMINI_API_KEY = req.api_key
    
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()
            
    new_lines = []
    key_found = False
    for line in lines:
        if line.startswith("GEMINI_API_KEY="):
            new_lines.append(f"GEMINI_API_KEY={req.api_key}\n")
            key_found = True
        else:
            new_lines.append(line)
            
    if not key_found:
        new_lines.append(f"GEMINI_API_KEY={req.api_key}\n")
        
    with open(env_path, "w") as f:
        f.writelines(new_lines)
        
    return {"status": "success", "message": "Gemini API key updated"}

# ── Groq Settings ───────────────────────────────────────────────────────────

@app.get("/api/settings/groq-key")
async def get_groq_key():
    from core.config import settings
    token = settings.GROQ_API_KEY
    if token:
        masked = token[:8] + "*" * (len(token) - 8) if len(token) > 8 else "***"
        return {"is_set": True, "masked_key": masked}
    return {"is_set": False, "masked_key": ""}

@app.post("/api/settings/groq-key")
async def update_groq_key(req: UpdateKeyRequest):
    from core.config import settings
    import os
    
    settings.GROQ_API_KEY = req.api_key
    
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()
            
    new_lines = []
    key_found = False
    for line in lines:
        if line.startswith("GROQ_API_KEY="):
            new_lines.append(f"GROQ_API_KEY={req.api_key}\n")
            key_found = True
        else:
            new_lines.append(line)
            
    if not key_found:
        new_lines.append(f"GROQ_API_KEY={req.api_key}\n")
        
    with open(env_path, "w") as f:
        f.writelines(new_lines)
        
    return {"status": "success", "message": "Groq API key updated"}

# ── OpenRouter Settings ─────────────────────────────────────────────────────

@app.get("/api/settings/openrouter-key")
async def get_openrouter_key():
    from core.config import settings
    token = settings.OPENROUTER_API_KEY
    if token:
        masked = token[:8] + "*" * (len(token) - 8) if len(token) > 8 else "***"
        return {"is_set": True, "masked_key": masked}
    return {"is_set": False, "masked_key": ""}

@app.post("/api/settings/openrouter-key")
async def update_openrouter_key(req: UpdateKeyRequest):
    from core.config import settings
    import os
    
    settings.OPENROUTER_API_KEY = req.api_key
    
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()
            
    new_lines = []
    key_found = False
    for line in lines:
        if line.startswith("OPENROUTER_API_KEY="):
            new_lines.append(f"OPENROUTER_API_KEY={req.api_key}\n")
            key_found = True
        else:
            new_lines.append(line)
            
    if not key_found:
        new_lines.append(f"OPENROUTER_API_KEY={req.api_key}\n")
        
    with open(env_path, "w") as f:
        f.writelines(new_lines)
        
    return {"status": "success", "message": "OpenRouter API key updated"}

# ── D-ID Settings ───────────────────────────────────────────────────────────

@app.get("/api/settings/did-key")
async def get_did_key():
    from core.config import settings
    token = settings.DID_API_KEY
    if token:
        masked = token[:8] + "*" * (len(token) - 8) if len(token) > 8 else "***"
        return {"is_set": True, "masked_key": masked}
    return {"is_set": False, "masked_key": ""}

@app.post("/api/settings/did-key")
async def update_did_key(req: UpdateKeyRequest):
    from core.config import settings
    import os
    
    settings.DID_API_KEY = req.api_key
    
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    lines = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            lines = f.readlines()
            
    new_lines = []
    key_found = False
    for line in lines:
        if line.startswith("DID_API_KEY="):
            new_lines.append(f"DID_API_KEY={req.api_key}\n")
            key_found = True
        else:
            new_lines.append(line)
            
    if not key_found:
        new_lines.append(f"DID_API_KEY={req.api_key}\n")
        
    with open(env_path, "w") as f:
        f.writelines(new_lines)
        
    return {"status": "success", "message": "D-ID API key updated"}



@app.post("/summarize")
async def summarize_article(req: SummarizeRequest):
    cache_key = f"summary_v2_{req.url}_{req.vernacular}_{req.role}"
    cached = get_cache(cache_key)
    if cached:
        return {"summary": cached, "cached": True}
        
    from db.sqlite import get_summary_from_db, save_summary_to_db
    import json
    db_cached = get_summary_from_db(req.url, req.vernacular)
    if db_cached:
        # Check if it has new fields; if not, regenerate
        if "decision_signal" in db_cached:
            set_cache(cache_key, db_cached, expiration=86400)
            return {"summary": db_cached, "cached": True}
        
    # Generate with expanded schema
    context = retrieve_context(f"{req.title}. {req.description}", top_k=2)
    if not context.strip():
        context = f"{req.title}. {req.description}"
        
    try:
        summary_obj, model_used = generate_summary(context, vernacular=req.vernacular, role=req.role)
        set_cache(cache_key, summary_obj, expiration=86400)
        save_summary_to_db(req.url, req.vernacular, json.dumps(summary_obj))
        return {"summary": summary_obj, "cached": False, "model_used": model_used}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat_copilot(req: ChatRequest):
    from fastapi.responses import StreamingResponse
    from ai.llama_inference import generate_chat_stream
    
    context = retrieve_context(req.query, top_k=2)
    history_payload = [{"role": m.role, "content": m.content} for m in req.history]
    
    return StreamingResponse(
        generate_chat_stream(
            req.query, context, history_payload,
            article_context=req.article_context,
            user_role=req.user_role
        ),
        media_type="text/plain",
        headers={"X-Context-Used": str(bool(context))}
    )

@app.get("/story")
async def get_grouped_story(title: str):
    """Find related articles using cosine similarity."""
    from ai.embeddings import get_embedding
    emb = get_embedding(title)
    
    if not emb:
        return {"related": []}
        
    results = faiss_store.search(emb, top_k=5)
    related = [r for r in results if r['metadata'].get('title') != title]
    return {"related": related}

# ── Task 1: News Navigator ─────────────────────────────────────────────────

@app.post("/navigator")
async def news_navigator(req: NavigatorRequest):
    """Multi-article intelligence briefing: groups related articles and generates
    a unified analysis across all of them."""
    cache_key = f"navigator_{req.title}"
    cached = get_cache(cache_key)
    if cached:
        return {"brief": cached, "cached": True}
    
    # Step 1: Find related articles via FAISS similarity grouping
    query = f"{req.title}. {req.description}"
    related_articles = retrieve_related_articles(query, top_k=15)
    
    if not related_articles:
        return {"brief": {"unified_summary": "No related articles found in the knowledge base.",
                          "key_themes": [], "conflicting_signals": [],
                          "market_impact": "", "risks": "", "opportunities": "",
                          "actionable_insight": "", "future_outlook": ""},
                "articles_used": 0, "cached": False}
    
    # Step 2: Build merged context from top articles
    multi_context = build_navigator_context(related_articles)
    
    # Step 3: Generate unified intelligence briefing
    try:
        brief, model_used = generate_navigator_brief(multi_context)
        set_cache(cache_key, brief, expiration=3600)
        return {
            "brief": brief,
            "articles_used": len(related_articles),
            "article_titles": [a["title"] for a in related_articles],
            "cached": False,
            "model_used": model_used
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ── Task 2: Story Arc Tracker ──────────────────────────────────────────────

@app.post("/story-arc")
async def story_arc_tracker(req: StoryArcRequest):
    """Analyzes how a story has evolved over time using chronological article data."""
    from db.sqlite import save_tracked_story, get_tracked_stories
    
    cache_key = f"story_arc_{req.topic}"
    cached = get_cache(cache_key)
    if cached:
        return {"arc": cached, "cached": True}
    
    # If user provides articles, save them for tracking
    for article in req.articles:
        save_tracked_story(
            topic=req.topic,
            article_url=article.get("url", ""),
            article_title=article.get("title", ""),
            article_description=article.get("description", ""),
            published_at=article.get("publishedAt", "")
        )
    
    # Step 1: Get timeline articles from FAISS
    timeline_articles = retrieve_story_timeline(req.topic, top_k=20)
    
    # Step 2: Also merge any previously tracked articles from SQLite
    tracked = get_tracked_stories(req.topic)
    tracked_urls = {a["url"] for a in timeline_articles}
    for t in tracked:
        if t["url"] not in tracked_urls:
            timeline_articles.append({
                "url": t["url"], "title": t["title"],
                "description": t["description"],
                "publishedAt": t["publishedAt"],
                "combined_text": t["description"] or t["title"]
            })
    
    # Re-sort chronologically after merge
    timeline_articles.sort(key=lambda x: x.get("publishedAt", "") or "")
    
    if not timeline_articles:
        return {"arc": {"timeline": [], "trend_analysis": "Insufficient data.",
                        "sentiment_shift": "", "key_turning_points": [],
                        "what_changed": "", "what_to_watch_next": ""},
                "articles_found": 0, "cached": False}
    
    # Step 3: Build context and generate analysis
    timeline_context = build_timeline_context(timeline_articles)
    
    try:
        arc, model_used = generate_story_arc(timeline_context, req.topic)
        set_cache(cache_key, arc, expiration=1800)
        
        # Auto-track all found articles for future lookups
        for article in timeline_articles:
            save_tracked_story(
                topic=req.topic,
                article_url=article.get("url", ""),
                article_title=article.get("title", ""),
                article_description=article.get("description", ""),
                published_at=article.get("publishedAt", "")
            )
        
        return {
            "arc": arc,
            "articles_found": len(timeline_articles),
            "cached": False,
            "model_used": model_used
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/tracked-topics")
async def get_topics():
    """Returns all topics being tracked for story arcs."""
    from db.sqlite import get_tracked_topics
    return {"topics": get_tracked_topics()}

# ── AI Video Generation ─────────────────────────────────────────────────────

@app.post("/generate-video")
async def generate_video(req: VideoRequest):
    """Generates an AI avatar video summarizing the news article."""
    # 1. Check cache first
    cache_key = f"video_{req.article_id}"
    cached_url = get_cache(cache_key)
    if cached_url:
        return {
            "video_url": cached_url,
            "status": "ready",
            "model_used": "cache"
        }
        
    # 2. Prepare script
    script = req.text.strip()
    if not script:
        # Generate script using AI (no text provided)
        prompt = f"""Convert this news into a short video script:
{req.article_id}
- Hook (1 line)
- 3–4 key points
- Conclusion (1 line)
Keep sentences short and conversational. Remove any markdown or special characters formatting like * or # as this will be read by text-to-speech. Return EXACTLY the plain text script."""
        try:
            script = _call_with_fallback(prompt)
            # Cleanup AI output in case it still included markdown
            script = script.replace('*', '').replace('#', '').strip()
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate video script: {str(e)}")
            
    # Fallback if script is suspiciously short or empty
    if len(script) < 10:
        script = "Welcome to the news update. Here are the top stories for today. Stay tuned for more."
        
    # Enforce rough length limit (D-ID can be slow/expensive with long text)
    if len(script) > 1000:
        script = script[:997] + "..."

    # 3. Call D-ID Service
    try:
        video_url = generate_avatar_video(script)
        # Cache the result permanently (or for a long time)
        set_cache(cache_key, video_url, expiration=86400 * 7) # Cache for 7 days
        return {
            "video_url": video_url,
            "status": "ready",
            "model_used": "d-id"
        }
    except Exception as e:
        # Check if it's already an HTTPException from the service
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

# ── AI Audio Generation ─────────────────────────────────────────────────────

@app.post("/generate-audio")
async def generate_audio_endpoint(req: AudioRequest):
    """Generates an AI audio brief using Piper TTS."""
    from ai.llama_inference import _call_with_fallback
    
    # Clean the article ID for the response URL
    safe_article_id = "".join([c if c.isalnum() else "_" for c in req.article_id])
    
    script = req.text.strip() if req.text else ""
    if not script:
        # Generate script using AI (no text provided)
        prompt = f"""Convert this news into a short audio briefing:

{req.article_id}

* Hook (1 line)
* 3–4 key insights
* Final takeaway

Keep it clear, concise, and under 60 seconds. Return ONLY the plain text script without markdown formatting."""
        try:
            script = _call_with_fallback(prompt)
            # Cleanup AI output removing markdown formatting
            script = script.replace('*', '').replace('#', '').strip()
        except Exception as e:
            # Check if it was manually triggered or from UI, return graceful response
            print(f"Failed to generate audio script: {str(e)}")
            return JSONResponse(status_code=500, content={"detail": f"Failed to generate AI script: {str(e)}"})
            
    # Enforce rough length limit to ensure it completes under 60 seconds
    if len(script) > 1500:
        script = script[:1497] + "..."

    # Call Audio Service
    try:
        generate_audio_service(script, req.article_id)
        return {
            "audio_url": f"/audio/{safe_article_id}.wav",
            "status": "ready"
        }
    except Exception as e:
        # Do not crash the server, just return the error gracefully
        print(f"Failed to generate TTS audio: {str(e)}")
        return JSONResponse(status_code=500, content={"detail": f"TTS Failure: {str(e)}"})
