import requests
import time
from core.config import settings
from fastapi import HTTPException

# D-ID API configuration
DID_API_URL = "https://api.d-id.com/talks"

def generate_avatar_video(script: str) -> str:
    """
    Calls D-ID API to generate a talking avatar video from the provided script.
    Polls the API until the video is 'done' and returns the result_url.
    """
    if not settings.DID_API_KEY:
        raise ValueError("DID_API_KEY is not configured")
    if not settings.DID_AVATAR_URL:
        raise ValueError("DID_AVATAR_URL is not configured")

    headers = {
        "Authorization": f"Basic {settings.DID_API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "script": {
            "type": "text",
            "input": script
        },
        "source_url": settings.DID_AVATAR_URL,
        "config": {
            "fluent": True,
            "stitch": True,
            "pad_audio": 0.0
        }
    }

    try:
        response = requests.post(DID_API_URL, json=payload, headers=headers, timeout=10)
        
        # If it's a 4xx or 5xx error, print the exact text from D-ID for debugging
        if not response.ok:
            error_text = response.text
            print(f"D-ID API Error ({response.status_code}): {error_text}")
            raise HTTPException(status_code=response.status_code, detail=f"D-ID API failed: {error_text}")
            
        talk_data = response.json()
        talk_id = talk_data.get("id")

        
        if not talk_id:
            raise ValueError(f"Failed to get talk ID from D-ID response: {talk_data}")
            
    except Exception as e:
        print(f"Error calling D-ID API: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to initiate video generation: {e}")

    # 2. Poll the job status until done
    poll_url = f"{DID_API_URL}/{talk_id}"
    max_attempts = 30 # roughly 60 seconds of polling
    
    for _ in range(max_attempts):
        time.sleep(2)
        try:
            poll_resp = requests.get(poll_url, headers=headers, timeout=5)
            poll_resp.raise_for_status()
            status_data = poll_resp.json()
            
            status = status_data.get("status")
            if status == "done":
                result_url = status_data.get("result_url")
                if not result_url:
                    raise ValueError("Job marked as done, but no result_url provided")
                return result_url
            elif status == "error":
                raise ValueError(f"D-ID API job failed: {status_data}")
                
        except Exception as e:
            print(f"Error polling D-ID API: {e}")
            raise HTTPException(status_code=500, detail=f"Error polling video status: {e}")
            
    raise HTTPException(status_code=408, detail="Timeout waiting for video generation to complete")
