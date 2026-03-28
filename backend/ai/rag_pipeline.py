from langchain_text_splitters import RecursiveCharacterTextSplitter
from ai.embeddings import get_embeddings_batch, get_embedding
from ai.faiss_store import add_texts, search
from collections import defaultdict

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=400,
    chunk_overlap=50,
    separators=["\n\n", "\n", " ", ""]
)

def process_and_index_articles(articles: list[dict]):
    """Chunks articles, embeds them, and saves to FAISS."""
    all_chunks = []
    all_metadatas = []
    
    for article in articles:
        text = f"{article.get('title', '')}. {article.get('description', '')} {article.get('content', '')}"
        chunks = text_splitter.split_text(text)
        
        for chunk in chunks:
            all_chunks.append(chunk)
            all_metadatas.append({
                "source": article.get("url", ""),
                "title": article.get("title", ""),
                "description": article.get("description", ""),
                "publishedAt": article.get("publishedAt", "")
            })
    
    batch_size = 32
    for i in range(0, len(all_chunks), batch_size):
        batch_chunks = all_chunks[i:i+batch_size]
        batch_metadatas = all_metadatas[i:i+batch_size]
        
        embeddings = get_embeddings_batch(batch_chunks)
        add_texts(batch_chunks, embeddings, batch_metadatas)

def retrieve_context(query: str, top_k: int = 5) -> str:
    """Retrieves relevant text chunks for a query."""
    query_emb = get_embedding(query)
    results = search(query_emb, top_k=top_k)
    
    context_parts = []
    for res in results:
        context_parts.append(res['content'])
        
    return "\n\n".join(context_parts)

# ── Task 1: Multi-Article Retrieval for Navigator ───────────────────────────

def retrieve_related_articles(query: str, top_k: int = 15) -> list[dict]:
    """Retrieves top 3-5 unique related articles by grouping FAISS chunk results
    by source URL and ranking by aggregate similarity (lowest total distance)."""
    query_emb = get_embedding(query)
    if not query_emb:
        return []
    
    results = search(query_emb, top_k=top_k)
    
    # Group by source URL, accumulate scores
    article_scores = defaultdict(lambda: {"distance": 0.0, "count": 0, "metadata": None, "chunks": []})
    
    for res in results:
        source = res["metadata"].get("source", "")
        if not source:
            continue
        entry = article_scores[source]
        entry["distance"] += res["distance"]
        entry["count"] += 1
        entry["chunks"].append(res["content"])
        if entry["metadata"] is None:
            entry["metadata"] = res["metadata"]
    
    # Rank by average distance (lower = more similar)
    ranked = sorted(article_scores.items(), key=lambda x: x[1]["distance"] / max(x[1]["count"], 1))
    
    # Return top 3-5 unique articles with their combined chunk text
    related_articles = []
    for source_url, data in ranked[:5]:
        related_articles.append({
            "url": source_url,
            "title": data["metadata"].get("title", ""),
            "description": data["metadata"].get("description", ""),
            "publishedAt": data["metadata"].get("publishedAt", ""),
            "combined_text": "\n".join(data["chunks"][:3]),  # Top 3 chunks per article
            "relevance_score": round(data["distance"] / max(data["count"], 1), 3)
        })
    
    return related_articles

def build_navigator_context(articles: list[dict]) -> str:
    """Builds a merged context string from multiple related articles for the Navigator."""
    parts = []
    for i, article in enumerate(articles, 1):
        parts.append(f"--- Article {i}: {article.get('title', 'Untitled')} ---")
        parts.append(f"Published: {article.get('publishedAt', 'Unknown')}")
        parts.append(article.get("combined_text", article.get("description", "")))
        parts.append("")
    return "\n".join(parts)

# ── Task 2: Timeline Retrieval for Story Arc ────────────────────────────────

def retrieve_story_timeline(query: str, top_k: int = 20) -> list[dict]:
    """Retrieves related articles sorted by publishedAt for story arc analysis."""
    query_emb = get_embedding(query)
    if not query_emb:
        return []
    
    results = search(query_emb, top_k=top_k)
    
    # Group by source URL (deduplicate chunks from same article)
    article_map = defaultdict(lambda: {"metadata": None, "chunks": []})
    
    for res in results:
        source = res["metadata"].get("source", "")
        if not source:
            continue
        entry = article_map[source]
        entry["chunks"].append(res["content"])
        if entry["metadata"] is None:
            entry["metadata"] = res["metadata"]
    
    # Build article list
    timeline_articles = []
    for source_url, data in article_map.items():
        timeline_articles.append({
            "url": source_url,
            "title": data["metadata"].get("title", ""),
            "description": data["metadata"].get("description", ""),
            "publishedAt": data["metadata"].get("publishedAt", ""),
            "combined_text": "\n".join(data["chunks"][:3])
        })
    
    # Sort by publishedAt (chronological)
    timeline_articles.sort(key=lambda x: x.get("publishedAt", "") or "")
    
    return timeline_articles[:10]  # Cap at 10 articles for context window

def build_timeline_context(articles: list[dict]) -> str:
    """Builds chronological context string for story arc analysis."""
    parts = []
    for i, article in enumerate(articles, 1):
        parts.append(f"--- [{article.get('publishedAt', 'Unknown date')}] {article.get('title', 'Untitled')} ---")
        parts.append(article.get("combined_text", article.get("description", "")))
        parts.append("")
    return "\n".join(parts)
