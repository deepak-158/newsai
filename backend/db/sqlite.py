import sqlite3
import os
from core.config import settings

db_connection = None

def connect_to_sqlite():
    global db_connection
    db_path = settings.SQLITE_DB_PATH
    dir_name = os.path.dirname(db_path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
        
    db_connection = sqlite3.connect(db_path, check_same_thread=False)
    
    # Initialize basic schema for future persistence
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
    
    # New table for precomputed summaries optimized lookups
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
    
    db_connection.commit()
    print(f"Connected to SQLite at {db_path}")

def close_sqlite_connection():
    global db_connection
    if db_connection:
        db_connection.close()
        print("Closed SQLite connection")

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
            import json
            return json.loads(row[0])
    except Exception as e:
        if "closed database" not in str(e).lower():
            print(f"DB Error fetching summary: {e}")
    return None
