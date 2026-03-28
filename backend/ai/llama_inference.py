import json
import requests
from core.config import settings

def call_gemini(prompt: str, format_json: bool = False) -> str:
    if not settings.GEMINI_API_KEY:
        raise ValueError("No Gemini API key")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3}
    }
    if format_json:
        payload["generationConfig"]["responseMimeType"] = "application/json"
        
    res = requests.post(url, json=payload, timeout=30)
    res.raise_for_status()
    data = res.json()
    
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise ValueError(f"Unexpected Gemini response: {data}")

def call_gemini_stream(prompt: str):
    if not settings.GEMINI_API_KEY:
        raise ValueError("No Gemini API key")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key={settings.GEMINI_API_KEY}"
    
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3}
    }
    
    res = requests.post(url, json=payload, stream=True, timeout=30)
    res.raise_for_status()
    
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
                    yield text
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue

def call_ollama(prompt: str, format_json: bool = False) -> str:
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": settings.OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.3, "num_ctx": 4096, "num_predict": 400}
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
            import json
            return json.dumps({
                "summary": "AI summarize service is currently unavailable.",
                "why_it_matters": "Service degraded. Please make sure Ollama is running internally.", 
                "market_impact": "None",
                "risks": "None",
                "future_prediction": "None",
                "error": str(e)
            })
        return f"Sorry, the AI Copilot is currently offline. Error: {str(e)}"

def call_ollama_stream(prompt: str):
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": settings.OLLAMA_MODEL,
        "prompt": prompt,
        "stream": True,
        "options": {"temperature": 0.3, "num_ctx": 4096, "num_predict": 400}
    }
    
    try:
        # Yield an initial empty space so FastAPI immediately sends HTTP headers to the frontend.
        # This unblocks the user's UI `fetch` promise so they don't see an infinite loading spinner waiting for Time-To-First-Token!
        yield " "
        
        response = requests.post(url, json=payload, stream=True, timeout=120)
        response.raise_for_status()
        for line in response.iter_lines():
            if line:
                chunk = json.loads(line)
                if "response" in chunk:
                    yield chunk["response"]
    except Exception as e:
        yield f"\\n[AI Offline or Error: {e}]"

def generate_summary(context: str, vernacular: bool = False) -> dict:
    """Generates structured summary focusing on top chunks"""
    vernacular_instr = "CRITICAL: Output the response in simplified Hinglish (Hindi + English mix). Not a literal translation, just an easy explanation." if vernacular else ""
    prompt = f"""
    You are a financial AI. Return EXACTLY this JSON schema for the given news, no other text:
    {{
      "summary": "2-sentence summary",
      "why_it_matters": "Why it matters",
      "market_impact": "Impact",
      "risks": "Risks",
      "future_prediction": "Prediction"
    }}
    {vernacular_instr}
    Context: {context}
    """
    
    try:
        # Step 1: Attempt Gemini Cloud speed
        res = call_gemini(prompt, format_json=True)
        parsed = json.loads(res)
        return parsed
    except Exception as gemini_err:
        print(f"Gemini routing failed: {gemini_err}. Falling back to Ollama offline.")
        # Step 2: Fallback explicitly to local Ollama!
        res = call_ollama(prompt, format_json=True)
        try:
            parsed = json.loads(res)
            return parsed
        except Exception as e:
            return {"summary": res, "error": f"Failed to parse JSON. {e}"}

def generate_chat_response(query: str, context: str, history=None) -> str:
    """Generates a conversational response using memory and context"""
    history_text = ""
    if history:
        for msg in history[-4:]: # Top 4 recent messages
            history_text += f"{str(msg.get('role', 'user')).upper()}: {msg.get('content', '')}\n"

    prompt = f"""
    You are a helpful AI News Co-Pilot. Use the provided context to answer the user's question accurately. If the answer is not in the context, use your best judgement but state that.

    Context:
    {context}

    Conversation History:
    {history_text}

    USER QUERY: {query}
    AI RESPONSE:
    """
    return call_ollama(prompt, format_json=False)

def generate_chat_stream(query: str, context: str, history=None):
    """Generates a conversational response using memory and context in a stream"""
    history_text = ""
    if history:
        for msg in history[-4:]:
            history_text += f"{str(msg.get('role', 'user')).upper()}: {msg.get('content', '')}\\n"

    prompt = f"""
    You are a helpful AI News Co-Pilot. Use the provided context to answer the user's question accurately. If the answer is not in the context, use your best judgement but state that.

    Context:
    {context}

    Conversation History:
    {history_text}

    USER QUERY: {query}
    AI RESPONSE:
    """
    yield " " # Ensure UI instantly unlocks "Reading context..." spinning 
    
    try:
        # Step 1: Stream from ultra-fast cloud engine
        gemini_gen = call_gemini_stream(prompt)
        # Verify first token isn't an error before committing to generator loop
        first_chunk = next(gemini_gen)
        yield first_chunk
        for chunk in gemini_gen:
            yield chunk
        return
    except Exception as e:
        print(f"Gemini chat stream failed: {e}. Cascading to Ollama engine!")
        
    try:
        # Step 2: Transparent UI offline fallback!
        ollama_gen = call_ollama_stream(prompt)
        for chunk in ollama_gen:
            if chunk.strip(): # Skip Ollama's inner dummy yields
                yield chunk
    except Exception as e:
        yield f"\\n[AI Offline or Error: {e}]"
