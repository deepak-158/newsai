import sqlite3
import os
import json
from core.config import settings

db_connection = None

def connect_to_sqlite():
    global db_connection
    db_path = settings.SQLITE_DB_PATH
    dir_name = os.path.dirname(db_path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
        
    db_connection = sqlite3.connect(db_path, check_same_thread=False)
    
    cursor = db_connection.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            description TEXT,
            content TEXT,
            url TEXT UNIQUE,
            publishedAt TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT,
            vernacular BOOLEAN,
            summary_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(url, vernacular)
        )
    ''')
    
    # Task 2: Story Arc Tracker — tracked stories table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tracked_stories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT,
            article_url TEXT,
            article_title TEXT,
            article_description TEXT,
            published_at TEXT,
            tracked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(topic, article_url)
        )
    ''')
    
    db_connection.commit()
    print(f"Connected to SQLite at {db_path}")

def close_sqlite_connection():
    global db_connection
    if db_connection:
        db_connection.close()
        print("Closed SQLite connection")

# ── Summaries ───────────────────────────────────────────────────────────────

def save_summary_to_db(url: str, vernacular: bool, summary_json: str):
    """Saves a computed summary exactly once using REPLACE on unique indices"""
    global db_connection
    if not db_connection: return
    try:
        cursor = db_connection.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO summaries (url, vernacular, summary_json)
            VALUES (?, ?, ?)
        ''', (url, vernacular, summary_json))
        db_connection.commit()
    except Exception as e:
        if "closed database" not in str(e).lower():
            print(f"DB Error saving summary: {e}")

def get_summary_from_db(url: str, vernacular: bool):
    """Retrieves a precomputed summary if it exists"""
    global db_connection
    if not db_connection: return None
    try:
        cursor = db_connection.cursor()
        cursor.execute('''
            SELECT summary_json FROM summaries 
            WHERE url = ? AND vernacular = ?
        ''', (url, vernacular))
        row = cursor.fetchone()
        if row:
            return json.loads(row[0])
    except Exception as e:
        if "closed database" not in str(e).lower():
            print(f"DB Error fetching summary: {e}")
    return None

# ── Tracked Stories (Task 2) ────────────────────────────────────────────────

def save_tracked_story(topic: str, article_url: str, article_title: str, 
                       article_description: str, published_at: str):
    """Saves an article to a tracked story topic."""
    global db_connection
    if not db_connection: return
    try:
        cursor = db_connection.cursor()
        cursor.execute('''
            INSERT OR IGNORE INTO tracked_stories 
            (topic, article_url, article_title, article_description, published_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (topic, article_url, article_title, article_description, published_at))
        db_connection.commit()
    except Exception as e:
        if "closed database" not in str(e).lower():
            print(f"DB Error saving tracked story: {e}")

def get_tracked_stories(topic: str) -> list[dict]:
    """Gets all articles tracked under a topic, sorted chronologically."""
    global db_connection
    if not db_connection: return []
    try:
        cursor = db_connection.cursor()
        cursor.execute('''
            SELECT article_url, article_title, article_description, published_at, tracked_at
            FROM tracked_stories 
            WHERE topic = ?
            ORDER BY published_at ASC
        ''', (topic,))
        rows = cursor.fetchall()
        return [
            {
                "url": r[0], "title": r[1], "description": r[2],
                "publishedAt": r[3], "tracked_at": r[4]
            }
            for r in rows
        ]
    except Exception as e:
        if "closed database" not in str(e).lower():
            print(f"DB Error fetching tracked stories: {e}")
    return []

def get_tracked_topics() -> list[str]:
    """Gets all unique tracked topic names."""
    global db_connection
    if not db_connection: return []
    try:
        cursor = db_connection.cursor()
        cursor.execute('SELECT DISTINCT topic FROM tracked_stories ORDER BY topic')
        return [r[0] for r in cursor.fetchall()]
    except Exception as e:
        if "closed database" not in str(e).lower():
            print(f"DB Error fetching topics: {e}")
    return []
