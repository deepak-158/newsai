from sentence_transformers import SentenceTransformer

# We use all-MiniLM-L6-v2 as requested for MVP local embeddings
model = SentenceTransformer('all-MiniLM-L6-v2')

def get_embedding(text: str) -> list[float]:
    """Generates embedding for a single string of text."""
    if not text or not text.strip():
        return []
    # Convert numpy array to list for FAISS / storage
    return model.encode(text).tolist()

def get_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Generates embeddings for a list of strings."""
    if not texts:
        return []
    return model.encode(texts).tolist()
