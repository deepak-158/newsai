import asyncio
from services.news_service import fetch_news_api
from ai.rag_pipeline import process_and_index_articles
from ai.llama_inference import generate_summary
from db.redis_cache import set_cache

def preprocessing_pipeline():
    print("Running background preprocessing...")
    # Fetch latest news
    articles = fetch_news_api("business OR finance OR tech", max_results=15)
    
    if not articles:
        return
        
    # Chunk and index in Vector DB
    process_and_index_articles(articles)
    
    from db.sqlite import get_summary_from_db, save_summary_to_db
    import json

    # Precompute summary for top stories
    for article in articles[:5]: # Precompute for top 5 stories
        url = article.get('url')
        if not url: continue
        
        # Avoid duplicate LLM execution if already in database
        existing = get_summary_from_db(url, vernacular=False)
        if existing:
            set_cache(f"summary_{url}_False", existing, expiration=86400)
            continue
            
        text_context = f"{article.get('title')}. {article.get('description')}"
        try:
             print(f"Background: Precomputing summary for {url}")
             summary = generate_summary(text_context)
             set_cache(f"summary_{url}_False", summary, expiration=86400)
             save_summary_to_db(url, False, json.dumps(summary))
        except Exception as e:
             print(f"Error generating precomputed summary for {url}: {e}")

def start_background_loop():
    loop = asyncio.get_event_loop()
    
    def background_worker():
        import time
        while True:
            try:
                preprocessing_pipeline()
            except Exception as e:
                print(f"Error in background task: {e}")
            time.sleep(3600) # Run every hour
            
    loop.run_in_executor(None, background_worker)
