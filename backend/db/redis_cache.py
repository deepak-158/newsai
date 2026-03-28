import redis
from core.config import settings
import json

redis_client = None
_redis_failed = False

def get_redis():
    global redis_client, _redis_failed
    if _redis_failed:
        return None
    if not redis_client:
        try:
            redis_client = redis.from_url(settings.REDIS_URI, decode_responses=True)
            redis_client.ping()
        except Exception as e:
            print(f"Redis connection failed: {e}. Falling back to in-memory cache.")
            _redis_failed = True
            redis_client = None
    return redis_client

_in_memory_cache = {}

def set_cache(key: str, value: dict, expiration: int = 3600):
    r = get_redis()
    if r:
        try:
            r.setex(key, expiration, json.dumps(value))
        except:
             _in_memory_cache[key] = value
    else:
        _in_memory_cache[key] = value

def get_cache(key: str):
    r = get_redis()
    if r:
        try:
            val = r.get(key)
            if val:
                return json.loads(val)
        except:
            return _in_memory_cache.get(key)
        return None
    return _in_memory_cache.get(key)
