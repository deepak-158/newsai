import json
import requests
import threading
from core.config import settings

# Thread-safe model tracking
_model_used_local = threading.local()

def get_last_model_used() -> str:
    """Returns the name of the last AI model that successfully generated a response."""
    return getattr(_model_used_local, 'model_name', 'unknown')

def _set_model_used(name: str):
    _model_used_local.model_name = name

# ── Global System Prompt (Task 7: Quality Control) ──────────────────────────
SYSTEM_PROMPT = """You are a clean, precise AI assistant for a news intelligence system.

STRICT RULES:
- Do NOT repeat sentences or phrases
- Do NOT generate duplicate responses
- Answer only once, clearly and concisely
- Do NOT include unnecessary greetings
- Do NOT hallucinate or add unrelated information
- Avoid generic statements
- Every insight must include cause → effect reasoning
- Include at least one non-obvious insight
- Include one contrarian perspective

FORMAT:
- Give only the final structured answer
- No repetition
- No fluff
"""

# ── Gemini Model Cascade ────────────────────────────────────────────────────
# When one model hits rate limits (429), try the next before falling to HF/Ollama.
GEMINI_MODELS = [
    "gemini-2.5-flash",       # Primary: fastest, cheapest
    "gemini-2.0-flash",       # Fallback 1: still fast
    "gemini-2.0-flash-lite",  # Fallback 2: lightweight
    "gemini-2.5-pro",         # Fallback 3: most capable but slower
]

def _gemini_generate_url(model: str) -> str:
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={settings.GEMINI_API_KEY}"

def _gemini_stream_url(model: str) -> str:
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={settings.GEMINI_API_KEY}"

def call_gemini(prompt: str, format_json: bool = False) -> str:
    """Tries each Gemini model in cascade order. Raises only if ALL models fail."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("No Gemini API key")
    
    full_prompt = f"{SYSTEM_PROMPT}\n\n{prompt}"
    payload = {
        "contents": [{"parts": [{"text": full_prompt}]}],
        "generationConfig": {"temperature": 0.3}
    }
    if format_json:
        payload["generationConfig"]["responseMimeType"] = "application/json"
    
    last_error = None
    for model in GEMINI_MODELS:
        try:
            url = _gemini_generate_url(model)
            res = requests.post(url, json=payload, timeout=60)
            res.raise_for_status()
            data = res.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            print(f"✓ Gemini cascade: {model} succeeded")
            return text
        except Exception as e:
            last_error = e
            print(f"✗ Gemini cascade: {model} failed ({e}). Trying next model...")
            continue
    
    raise ValueError(f"All Gemini models failed. Last error: {last_error}")

def call_gemini_stream(prompt: str):
    """Tries each Gemini model for streaming. Falls through cascade on failure."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("No Gemini API key")
    
    full_prompt = f"{SYSTEM_PROMPT}\n\n{prompt}"
    payload = {
        "contents": [{"parts": [{"text": full_prompt}]}],
        "generationConfig": {"temperature": 0.3}
    }
    
    for model in GEMINI_MODELS:
        try:
            url = _gemini_stream_url(model)
            res = requests.post(url, json=payload, stream=True, timeout=60)
            res.raise_for_status()
            
            yielded = False
            for line in res.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8')
                    if decoded_line.startswith("data: "):
                        data_str = decoded_line[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            text = chunk["candidates"][0]["content"]["parts"][0]["text"]
                            yielded = True
                            yield text
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
            
            if yielded:
                print(f"✓ Gemini stream cascade: {model} succeeded")
                return  # Successfully streamed, exit cascade
            
        except Exception as e:
            print(f"✗ Gemini stream cascade: {model} failed ({e}). Trying next model...")
            continue
    
    raise ValueError("All Gemini models failed for streaming")

# ── Groq Inference (Fast Fallback 1) ────────────────────────────────────────

def _groq_headers() -> dict:
    return {"Authorization": f"Bearer {settings.GROQ_API_KEY}"}

def call_groq(prompt: str, format_json: bool = False) -> str:
    if not settings.GROQ_API_KEY:
        raise ValueError("No GROQ_API_KEY configured")
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
    }
    if format_json:
        payload["response_format"] = {"type": "json_object"}
        
    try:
        res = requests.post(url, json=payload, headers=_groq_headers(), timeout=60)
        res.raise_for_status()
        print("✓ Groq succeeded")
        return res.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"✗ Groq failed: {e}")
        raise

def call_groq_stream(prompt: str):
    if not settings.GROQ_API_KEY:
        raise ValueError("No GROQ_API_KEY configured")
    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "stream": True
    }
    try:
        res = requests.post(url, json=payload, headers=_groq_headers(), stream=True, timeout=60)
        res.raise_for_status()
        for line in res.iter_lines():
            if line:
                decoded = line.decode('utf-8')
                if decoded.startswith("data: "):
                    data_str = decoded[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        if "content" in chunk["choices"][0]["delta"] and chunk["choices"][0]["delta"]["content"]:
                            yield chunk["choices"][0]["delta"]["content"]
                    except:
                        continue
    except Exception as e:
        raise ValueError(f"Groq stream failed: {e}")

# ── OpenRouter Inference (Deep Fallback 2) ──────────────────────────────────

def _openrouter_headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "ET IntelliSphere"
    }

def call_openrouter(prompt: str, format_json: bool = False) -> str:
    if not settings.OPENROUTER_API_KEY:
        raise ValueError("No OPENROUTER_API_KEY configured")
    url = "https://openrouter.ai/api/v1/chat/completions"
    payload = {
        "model": "google/gemini-2.0-flash-lite-preview-02-05:free",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
    }
    if format_json:
        payload["response_format"] = {"type": "json_object"}
        
    try:
        res = requests.post(url, json=payload, headers=_openrouter_headers(), timeout=60)
        res.raise_for_status()
        print("✓ OpenRouter succeeded")
        return res.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"✗ OpenRouter failed: {e}")
        raise

def call_openrouter_stream(prompt: str):
    if not settings.OPENROUTER_API_KEY:
        raise ValueError("No OPENROUTER_API_KEY configured")
    url = "https://openrouter.ai/api/v1/chat/completions"
    payload = {
        "model": "google/gemini-2.0-flash-lite-preview-02-05:free",
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.3,
        "stream": True
    }
    try:
        res = requests.post(url, json=payload, headers=_openrouter_headers(), stream=True, timeout=60)
        res.raise_for_status()
        for line in res.iter_lines():
            if line:
                decoded = line.decode('utf-8')
                if decoded.startswith("data: "):
                    data_str = decoded[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data_str)
                        if "content" in chunk["choices"][0]["delta"] and chunk["choices"][0]["delta"]["content"]:
                            yield chunk["choices"][0]["delta"]["content"]
                    except:
                        continue
    except Exception as e:
        raise ValueError(f"OpenRouter stream failed: {e}")


# ── Ollama / LLaMA Local Calls ──────────────────────────────────────────────

def call_ollama(prompt: str, format_json: bool = False) -> str:
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"
    full_prompt = f"{SYSTEM_PROMPT}\n\n{prompt}"
    payload = {
        "model": settings.OLLAMA_MODEL,
        "prompt": full_prompt,
        "stream": False,
        "options": {"temperature": 0.3, "num_ctx": 4096, "num_predict": 600}
    }
    if format_json:
        payload["format"] = "json"
        
    try:
        response = requests.post(url, json=payload, timeout=120)
        response.raise_for_status()
        data = response.json()
        return data.get("response", "")
    except Exception as e:
        print(f"Ollama connection error: {e}")
        if format_json:
            return json.dumps({
                "summary": "AI service is currently unavailable.",
                "market_impact": "Unable to assess.",
                "risks": "Unable to assess.",
                "future_prediction": "Unable to assess.",
                "actionable_insight": "Retry when AI services are back online.",
                "contrarian_view": "",
                "second_order_effects": "",
                "decision_signal": {"verdict": "Neutral", "confidence": "Low"},
                "personalized_impact": "",
                "error": str(e)
            })
        return f"Sorry, the AI Copilot is currently offline. Error: {str(e)}"

def call_ollama_stream(prompt: str):
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"
    full_prompt = f"{SYSTEM_PROMPT}\n\n{prompt}"
    payload = {
        "model": settings.OLLAMA_MODEL,
        "prompt": full_prompt,
        "stream": True,
        "options": {"temperature": 0.3, "num_ctx": 4096, "num_predict": 600}
    }
    
    try:
        yield " "
        response = requests.post(url, json=payload, stream=True, timeout=120)
        response.raise_for_status()
        for line in response.iter_lines():
            if line:
                chunk = json.loads(line)
                if "response" in chunk:
                    yield chunk["response"]
    except Exception as e:
        yield f"\n[AI Offline or Error: {e}]"

# ══════════════════════════════════════════════════════════════════════════════
# UNIFIED FALLBACK CHAIN: Gemini → Groq → OpenRouter → Ollama
# ══════════════════════════════════════════════════════════════════════════════

def _call_with_fallback(prompt: str, format_json: bool = False) -> str:
    """Unified fallback: Gemini → HuggingFace → Ollama.
    Each layer is tried in order. If one fails, the next is attempted.
    Tracks which model succeeded via thread-local storage."""
    
    # Layer 1: Gemini (cascade of models)
    try:
        result = call_gemini(prompt, format_json=format_json)
        _set_model_used("Gemini")
        print("🟢 Fallback chain: Gemini succeeded")
        return result
    except Exception as e:
        print(f"🔴 Fallback chain: Gemini failed ({e})")
    
    # Layer 2: Groq
    try:
        result = call_groq(prompt, format_json=format_json)
        _set_model_used("Groq")
        print("🟡 Fallback chain: Groq succeeded")
        return result
    except Exception as e:
        print(f"🔴 Fallback chain: Groq failed ({e})")

    # Layer 3: OpenRouter
    try:
        result = call_openrouter(prompt, format_json=format_json)
        _set_model_used("OpenRouter")
        print("🟡 Fallback chain: OpenRouter succeeded")
        return result
    except Exception as e:
        print(f"🔴 Fallback chain: OpenRouter failed ({e})")
    
    # Layer 4: Local Ollama
    _set_model_used("Ollama")
    print("🟠 Fallback chain: Falling to local Ollama")
    return call_ollama(prompt, format_json=format_json)

def _stream_with_fallback(prompt: str):
    """Unified streaming fallback: Gemini → HuggingFace → Ollama.
    Emits a __MODEL:name__ token at the start so the frontend knows which model is active."""
    
    # Layer 1: Gemini streaming
    try:
        gemini_gen = call_gemini_stream(prompt)
        first_chunk = next(gemini_gen)
        _set_model_used("Gemini")
        print("🟢 Stream fallback: Gemini streaming")
        yield "__MODEL:Gemini__"
        yield first_chunk
        for chunk in gemini_gen:
            yield chunk
        return
    except Exception as e:
        print(f"🔴 Stream fallback: Gemini failed ({e})")
    
    # Layer 2: Groq streaming
    try:
        groq_gen = call_groq_stream(prompt)
        first_chunk = next(groq_gen)
        _set_model_used("Groq")
        print("🟡 Stream fallback: Groq streaming")
        yield "__MODEL:Groq__"
        yield first_chunk
        for chunk in groq_gen:
            yield chunk
        return
    except Exception as e:
        print(f"🔴 Stream fallback: Groq failed ({e})")

    # Layer 3: OpenRouter streaming
    try:
        or_gen = call_openrouter_stream(prompt)
        first_chunk = next(or_gen)
        _set_model_used("OpenRouter")
        print("🟡 Stream fallback: OpenRouter streaming")
        yield "__MODEL:OpenRouter__"
        yield first_chunk
        for chunk in or_gen:
            yield chunk
        return
    except Exception as e:
        print(f"🔴 Stream fallback: OpenRouter failed ({e})")
    
    # Layer 4: Local Ollama streaming
    _set_model_used("Ollama")
    print("🟠 Stream fallback: Falling to Ollama streaming")
    yield "__MODEL:Ollama__"
    try:
        ollama_gen = call_ollama_stream(prompt)
        for chunk in ollama_gen:
            if chunk.strip():
                yield chunk
    except Exception as e:
        yield f"\n[All AI services failed: {e}]"

# ── Task 3: Upgraded Summary ────────────────────────────────────────────────

SUMMARY_SCHEMA = {
    "summary": "2-sentence executive summary",
    "market_impact": "Direct market/industry impact with cause-effect reasoning",
    "risks": "Key risks with probability assessment",
    "future_prediction": "What happens next (specific, not vague)",
    "actionable_insight": "One concrete action to take based on this news",
    "contrarian_view": "One perspective that challenges the mainstream narrative",
    "second_order_effects": "Indirect consequences most people miss",
    "decision_signal": {
        "verdict": "Positive | Neutral | Negative",
        "confidence": "Low | Medium | High"
    },
    "personalized_impact": "How this specifically affects the reader based on their role"
}

def generate_summary(context: str, vernacular: bool = False, role: str = "") -> tuple[dict, str]:
    """Generates expanded structured summary with decision signals.
    Fallback chain: Gemini → HuggingFace → Ollama.
    Returns (summary_dict, model_used_name)."""
    vernacular_instr = "CRITICAL: Output the response in simplified Hinglish (Hindi + English mix). Not a literal translation, just an easy explanation." if vernacular else ""
    role_instr = f"The reader is a {role}. Tailor personalized_impact to their perspective." if role else "Write personalized_impact for a general business reader."
    
    prompt = f"""Analyze this news and return EXACTLY this JSON schema, no other text:
{json.dumps(SUMMARY_SCHEMA, indent=2)}

Rules:
- summary: exactly 2 sentences, no filler
- contrarian_view: must genuinely challenge the obvious interpretation
- second_order_effects: identify a non-obvious downstream consequence
- decision_signal.verdict: must be exactly one of Positive, Neutral, or Negative
- decision_signal.confidence: must be exactly one of Low, Medium, or High
- actionable_insight: specific enough that someone could act on it today
{role_instr}
{vernacular_instr}

News Context:
{context}"""
    
    res = _call_with_fallback(prompt, format_json=True)
    model = get_last_model_used()
    try:
        parsed = json.loads(res)
        return parsed, model
    except Exception as e:
        return {"summary": res, "error": f"Failed to parse JSON. {e}"}, model

# ── Task 1: News Navigator (Multi-Article Intelligence) ─────────────────────

NAVIGATOR_SCHEMA = {
    "unified_summary": "What is really happening across all these articles",
    "key_themes": ["theme1", "theme2", "theme3"],
    "conflicting_signals": ["signal1", "signal2"],
    "market_impact": "Combined market/industry impact",
    "risks": "Aggregated risk assessment",
    "opportunities": "Opportunities emerging from this cluster of events",
    "actionable_insight": "The single most important action to take",
    "future_outlook": "Where this cluster of events is heading"
}

def generate_navigator_brief(multi_context: str) -> tuple[dict, str]:
    """Generates unified intelligence briefing from multiple related articles.
    Fallback chain: Gemini → HuggingFace → Ollama.
    Returns (brief_dict, model_used_name)."""
    
    prompt = f"""Analyze multiple related news articles and generate a unified intelligence briefing.
Return EXACTLY this JSON schema:
{json.dumps(NAVIGATOR_SCHEMA, indent=2)}

Focus on:
- What is really happening overall (synthesize, don't summarize each article)
- Key themes that connect these articles
- Conflicting signals or disagreements between sources
- Real-world market and industry impact
- What matters most and what action to take

Rules:
- key_themes: exactly 3-5 themes, each one phrase
- conflicting_signals: identify genuine contradictions (empty array if none)
- unified_summary: synthesize into one coherent narrative, max 3 sentences
- actionable_insight: specific enough to act on immediately

Articles:
{multi_context}"""
    
    res = _call_with_fallback(prompt, format_json=True)
    model = get_last_model_used()
    try:
        return json.loads(res), model
    except Exception:
        return {"unified_summary": res, "key_themes": [], "conflicting_signals": [],
                "market_impact": "", "risks": "", "opportunities": "",
                "actionable_insight": "", "future_outlook": ""}, model

# ── Task 2: Story Arc Tracker ───────────────────────────────────────────────

STORY_ARC_SCHEMA = {
    "timeline": [{"date": "YYYY-MM-DD", "event": "What happened"}],
    "trend_analysis": "Overall direction and momentum of this story",
    "sentiment_shift": "How public/market sentiment has changed",
    "key_turning_points": ["turning_point_1", "turning_point_2"],
    "what_changed": "The most significant change from start to now",
    "what_to_watch_next": "What to monitor going forward"
}

def generate_story_arc(timeline_context: str, topic: str) -> tuple[dict, str]:
    """Analyzes how a story has evolved over time.
    Fallback chain: Gemini → HuggingFace → Ollama.
    Returns (arc_dict, model_used_name)."""
    
    prompt = f"""Analyze how this story has evolved over time.
Topic: {topic}

Return EXACTLY this JSON schema:
{json.dumps(STORY_ARC_SCHEMA, indent=2)}

Focus on:
- Key events timeline (chronological order, real dates from articles)
- How sentiment changed over time
- Important turning points that shifted the narrative
- What has fundamentally changed
- What to watch next (specific, not vague)

Rules:
- timeline: chronological order, use actual dates from articles
- key_turning_points: moments that changed the story's direction
- what_to_watch_next: specific triggers or dates to monitor

Articles (chronological):
{timeline_context}"""
    
    res = _call_with_fallback(prompt, format_json=True)
    model = get_last_model_used()
    try:
        return json.loads(res), model
    except Exception:
        return {"timeline": [], "trend_analysis": res, "sentiment_shift": "",
                "key_turning_points": [], "what_changed": "", "what_to_watch_next": ""}, model

# ── Task 4: Enhanced Chat Co-Pilot ──────────────────────────────────────────

def generate_chat_response(query: str, context: str, history=None, 
                           article_context: str = "", user_role: str = "") -> str:
    """Generates conversational response with article context and role awareness."""
    history_text = ""
    if history:
        for msg in history[-5:]:
            history_text += f"{str(msg.get('role', 'user')).upper()}: {msg.get('content', '')}\n"

    role_line = f"User Role: {user_role}" if user_role else "User Role: General reader"
    article_line = f"Current Article/Story Context:\n{article_context}" if article_context else ""

    prompt = f"""You are an AI News Intelligence Co-Pilot. Answer the user's question using the provided context.

Rules:
- Be direct and specific
- Use cause→effect reasoning
- If the question is about risks, include probability assessment
- If the question asks for a contrarian view, genuinely challenge the mainstream narrative
- If asked to explain simply, use analogies and plain language
- If the answer is not in the context, state that clearly

{role_line}

{article_line}

RAG Context:
{context}

Conversation History:
{history_text}

USER QUESTION: {query}
RESPONSE:"""
    return _call_with_fallback(prompt, format_json=False)

def generate_chat_stream(query: str, context: str, history=None,
                         article_context: str = "", user_role: str = ""):
    """Streams conversational response with full context awareness.
    Fallback chain: Gemini stream → HuggingFace → Ollama stream."""
    history_text = ""
    if history:
        for msg in history[-5:]:
            history_text += f"{str(msg.get('role', 'user')).upper()}: {msg.get('content', '')}\n"

    role_line = f"User Role: {user_role}" if user_role else "User Role: General reader"
    article_line = f"Current Article/Story Context:\n{article_context}" if article_context else ""

    prompt = f"""You are an AI News Intelligence Co-Pilot. Answer the user's question using the provided context.

Rules:
- Be direct and specific
- Use cause→effect reasoning
- If the question is about risks, include probability assessment
- If the question asks for a contrarian view, genuinely challenge the mainstream narrative
- If asked to explain simply, use analogies and plain language
- If the answer is not in the context, state that clearly

{role_line}

{article_line}

RAG Context:
{context}

Conversation History:
{history_text}

USER QUESTION: {query}
RESPONSE:"""
    
    yield " "
    
    for chunk in _stream_with_fallback(prompt):
        yield chunk
