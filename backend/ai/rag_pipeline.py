from langchain_text_splitters import RecursiveCharacterTextSplitter
from ai.embeddings import get_embeddings_batch
from ai.faiss_store import add_texts, search

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=400, # 300-500 tokens as requested
    chunk_overlap=50,
    separators=["\n\n", "\n", " ", ""]
)

def process_and_index_articles(articles: list[dict]):
    """Chunks articles, embeds them, and saves to FAISS."""
    all_chunks = []
    all_metadatas = []
    
    for article in articles:
        # Create a combined text for the article
        text = f"{article.get('title', '')}. {article.get('description', '')} {article.get('content', '')}"
        chunks = text_splitter.split_text(text)
        
        for chunk in chunks:
            all_chunks.append(chunk)
            all_metadatas.append({
                "source": article.get("url", ""),
                "title": article.get("title", ""),
                "publishedAt": article.get("publishedAt", "")
            })
    
    # Process in batches if list is large
    batch_size = 32
    for i in range(0, len(all_chunks), batch_size):
        batch_chunks = all_chunks[i:i+batch_size]
        batch_metadatas = all_metadatas[i:i+batch_size]
        
        embeddings = get_embeddings_batch(batch_chunks)
        add_texts(batch_chunks, embeddings, batch_metadatas)

def retrieve_context(query: str, top_k: int = 5) -> str:
    from ai.embeddings import get_embedding
    query_emb = get_embedding(query)
    results = search(query_emb, top_k=top_k)
    
    context_parts = []
    for res in results:
        context_parts.append(res['content'])
        
    return "\n\n".join(context_parts)
