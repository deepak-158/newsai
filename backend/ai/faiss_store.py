import faiss
import numpy as np
import os
import json
from core.config import settings

embedding_dim = 384 # all-MiniLM-L6-v2 dimension
index = faiss.IndexFlatL2(embedding_dim)

# Simple metadata store parallel to FAISS index
metadata_store = {}
current_id = 0

def init_faiss():
    global index, metadata_store, current_id
    os.makedirs(os.path.dirname(settings.FAISS_INDEX_PATH), exist_ok=True)
    if os.path.exists(settings.FAISS_INDEX_PATH):
        index = faiss.read_index(settings.FAISS_INDEX_PATH)
        if os.path.exists(settings.FAISS_INDEX_PATH + ".meta"):
            with open(settings.FAISS_INDEX_PATH + ".meta", "r") as f:
                data = json.load(f)
                # JSON keys are strings, convert to int
                metadata_store = {int(k): v for k, v in data["metadata"].items()}
                current_id = data["current_id"]

def save_faiss():
    faiss.write_index(index, settings.FAISS_INDEX_PATH)
    with open(settings.FAISS_INDEX_PATH + ".meta", "w") as f:
        json.dump({"metadata": metadata_store, "current_id": current_id}, f)

def add_texts(texts: list[str], embeddings: list[list[float]], metadatas: list[dict]):
    global current_id, index, metadata_store
    if not texts:
        return
    
    vectors = np.array(embeddings).astype("float32")
    index.add(vectors)
    
    for i in range(len(texts)):
        metadata_store[current_id] = {
            "text": texts[i],
            "metadata": metadatas[i]
        }
        current_id += 1
    
    save_faiss()

def search(query_embedding: list[float], top_k: int = 5):
    if index.ntotal == 0:
        return []
    
    query_vector = np.array([query_embedding]).astype("float32")
    distances, indices = index.search(query_vector, top_k)
    
    results = []
    for i in range(len(indices[0])):
        idx = int(indices[0][i])
        if idx != -1 and idx in metadata_store:
            results.append({
                "distance": float(distances[0][i]),
                "content": metadata_store[idx]["text"],
                "metadata": metadata_store[idx]["metadata"]
            })
    return results

# init on load
init_faiss()
