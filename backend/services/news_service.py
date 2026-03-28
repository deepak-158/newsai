import requests
from core.config import settings
from db.redis_cache import get_cache, set_cache

def fetch_news_api(query: str = "business AND finance", country: str = None, search_term: str = None, max_results: int = 10):
    cache_key = f"newsdata_{query}_{country}_{search_term}_{max_results}"
    cached = get_cache(cache_key)
    if cached:
        return cached

    # Build NewsData.io query URL
    q_param = query
    if search_term:
        q_param += f" AND {search_term}"
        
    import urllib.parse
    encoded_q = urllib.parse.quote(q_param)
    url = f"https://newsdata.io/api/1/news?apikey={settings.NEWSDATA_API_KEY}&q={encoded_q}&language=en"
    
    if country and country != 'all':
        url += f"&country={country}"
    
    try:
         response = requests.get(url, timeout=10)
         response.raise_for_status()
         data = response.json()
         
         raw_articles = data.get("results", [])
         mapped_articles = []
         
         for a in raw_articles:
             mapped_articles.append({
                 "title": a.get("title", ""),
                 "description": a.get("description", "") or a.get("title", ""),
                 "content": a.get("content", "") or a.get("description", ""),
                 "url": a.get("link", ""),
                 "publishedAt": a.get("pubDate", "")
             })
             
         if mapped_articles:
             set_cache(cache_key, mapped_articles[:max_results], expiration=3600)
             return mapped_articles[:max_results]
    except Exception as e:
         print(f"Error fetching NewsData API: {e}")
         
    # Fallback dummy data if API fails or returns empty
    fallback_articles = [
        {
            "title": "Markets rally globally amid new trade pacts",
            "description": "Global markets saw significant gains as investors anticipate new positive trade developments.",
            "content": "Stocks surged on Monday. The tech sector led the charge following strong earnings expectations.",
            "url": "https://example.com/markets",
            "publishedAt": "2024-01-01T00:00:00Z"
        },
        {
            "title": "Tech startup XYZ raises $50M in Series B",
            "description": "AI startup XYZ has secured $50M to scale its generative AI product for enterprise customers.",
            "content": "The funding round was led by major venture firms, underscoring the ongoing boom in AI investments.",
            "url": "https://example.com/startup",
            "publishedAt": "2024-01-02T00:00:00Z"
        }
    ]
    return fallback_articles
