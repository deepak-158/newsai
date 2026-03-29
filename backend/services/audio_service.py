import os
import subprocess
import logging

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Define paths relative to the current file
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
AUDIO_DIR = os.path.join(BASE_DIR, "audio")
MODEL_NAME = "en_US-lessac-medium.onnx"

# Ensure the audio directory exists
os.makedirs(AUDIO_DIR, exist_ok=True)

def generate_audio(script: str, article_id: str) -> str:
    """
    Generates a local audio summary using Piper TTS.
    Returns the path to the generated audio file.
    """
    # Clean the article ID to create a safe file name
    safe_article_id = "".join([c if c.isalnum() else "_" for c in article_id])
    file_path = os.path.join(AUDIO_DIR, f"{safe_article_id}.wav")
    
    # 1. Caching check: Avoid regenerating audio
    if os.path.exists(file_path):
        logger.info(f"Audio file already exists for {safe_article_id}. Returning cached file.")
        return file_path
        
    # 2. Piper Command
    # Make sure piper is in your system's PATH. 
    # Also requires en_US-lessac-medium.onnx and its matching json config to be in the working directory
    command = [
        "piper",
        "--model", MODEL_NAME,
        "--output_file", file_path
    ]
    
    logger.info(f"Generating audio for {safe_article_id} with Piper...")
    logger.info(f"Script length: {len(script)} characters")
    
    try:
        # Pass the script string to stdin of the subprocess
        process = subprocess.Popen(
            command, 
            stdin=subprocess.PIPE, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True,
            cwd=BASE_DIR # Execute in the backend directory so it can find the model file if it's there
        )
        stdout, stderr = process.communicate(input=script, timeout=60)
        
        if process.returncode != 0:
            error_msg = f"Piper failed with return code {process.returncode}: {stderr}"
            logger.error(error_msg)
            
            # If a partially broken file was generated, remove it
            if os.path.exists(file_path):
                os.remove(file_path)
                
            raise Exception(error_msg)
            
        logger.info(f"Audio successfully generated: {file_path}")
        return file_path
        
    except FileNotFoundError:
        # Catch case where 'piper' is not in PATH
        error_msg = "Piper executable not found. Please ensure Piper is installed and added to your system PATH."
        logger.error(error_msg)
        raise Exception(error_msg)
    except subprocess.TimeoutExpired:
        process.kill()
        error_msg = "Piper TTS generation timed out after 60 seconds."
        logger.error(error_msg)
        
        # Cleanup incomplete file
        if os.path.exists(file_path):
            os.remove(file_path)
            
        raise Exception(error_msg)
    except Exception as e:
        logger.error(f"Error during audio generation: {e}")
        # Cleanup incomplete file
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass
        raise Exception(f"Failed to generate audio: {str(e)}")
