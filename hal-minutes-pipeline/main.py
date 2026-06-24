import os
import sys
import uuid
import shutil
import smtplib
import bcrypt
import mysql.connector
import ollama  
from fastapi import FastAPI, Form, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from faster_whisper import WhisperModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DATABASE CONFIGURATION ---
DB_CONFIG = {
    "host": "localhost",
    "user": "root",          
    "password": "Hal_aao123",  # 💻 REPLACE WITH YOUR ACTUAL LOCAL MYSQL PASSWORD
    "database": "minutes_ai_db"
}

SMTP_SERVER = "192.168.1.10"  
SMTP_PORT = 25                
SENDER_EMAIL = "minutes-ai@company.local"
UPLOAD_DIR = "uploaded_audio"
OUTPUT_DIR = "generated_docs"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("[Audio Engine] Loading local Whisper Model...")
whisper_engine = WhisperModel("tiny", device="cpu", compute_type="int8")


# --- EMBEDDED LOCAL OLLAMA PIPELINE ---
def generate_offline_summary(raw_transcript: str) -> str:
    """
    Sends the raw transcript to the local Ollama instance running Llama 3.
    """
    print("\n[AI Engine] Analyzing raw meeting notes via local Ollama...")
    
    system_instruction = (
        "You are an elite corporate secretary on a highly secure intranet network. "
        "Your task is to organize conversational, unstructured meeting transcripts into professional minutes.\n\n"
        "CRITICAL RULE: Only reject the transcript if it is absolute garbage, such as a single word "
        "repeated dozens of times, pure static noise text, or completely unreadable gibberish. "
        "If there is ANY mention of tasks, dates, technology, or project status (even if brief or conversational), "
        "do NOT reject it. Treat it as a valid meeting.\n\n"
        "If it is a valid meeting, you must output exactly these clear markdown sections:\n"
        "1. ## Executive Summary\n"
        "2. ## Problems Identified & Challenges\n"
        "3. ## Solutions Proposed & Decisions Made\n"
        "4. ## Action Items, Assignments & Deadlines (Format explicitly as '[Name] - Task - Deadline')"
    )
    
    try:
        response = ollama.chat(
            model='llama3',
            messages=[
                {'role': 'system', 'content': system_instruction},
                {'role': 'user', 'content': f"Here are the meeting notes:\n{raw_transcript}"}
            ]
        )
        return response.message.content
    except Exception as e:
        return f"Error connecting to local Ollama service: {str(e)}"


# --- UTILITY CORE HELPER METHODS ---

def get_db_connection():
    return mysql.connector.connect(**DB_CONFIG)

def transcribe_offline_audio(audio_path: str) -> str:
    segments, info = whisper_engine.transcribe(audio_path, beam_size=5)
    return " ".join([segment.text for segment in segments])

def build_pdf(summary_text: str, transcript_text: str, filename: str, meeting_date: str) -> str:
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    
    pdf_path = os.path.join(OUTPUT_DIR, filename)
    doc = SimpleDocTemplate(pdf_path, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    
    body_style = ParagraphStyle('CustomBody', parent=styles['Normal'], fontSize=10, leading=14, spaceAfter=6)
    heading_style = ParagraphStyle('CustomHeading', parent=styles['Heading2'], fontSize=14, leading=18, spaceBefore=12, spaceAfter=6, keepWithNext=True)

    story = [
        Paragraph("<b>Official Meeting Minutes Report</b>", styles['Title']),
        Paragraph(f"<font color='#555555'><b>Session Date:</b> {meeting_date}</font>", styles['Normal']),
        Spacer(1, 15),
        Paragraph("<b>AI-Generated Summary Dashboard</b>", heading_style)
    ]
    
    for line in summary_text.split('\n'):
        line = line.strip()
        if not line:
            story.append(Spacer(1, 6))
            continue
        if line.startswith('##'):
            story.append(Paragraph(f"<b>{line.replace('##', '').strip()}</b>", heading_style))
        else:
            clean_line = line.replace('<', '&lt;').replace('>', '&gt;')
            story.append(Paragraph(clean_line, body_style))
            
    story.append(Spacer(1, 15))
    story.append(Paragraph("<b>Raw Transcript Log</b>", heading_style))
    clean_tx = transcript_text.replace('<', '&lt;').replace('>', '&gt;').replace('\n', '<br/>')
    story.append(Paragraph(clean_tx, body_style))
    
    doc.build(story)
    return pdf_path


# --- SECURE AUTHENTICATION ENDPOINTS (WITH ACCOUNT SEPARATION) ---

@app.post("/api/auth")
def authenticate_user(
    username: str = Form(...), 
    password: str = Form(...),
    is_signup: bool = Form(False)  # Defaults to False (Standard Login mode)
):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cursor.fetchone()
    
    # SCENARIO 1: User explicitly wants to register a brand new account
    if is_signup:
        if user:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail="Username is already taken.")
        
        # Hash password securely and inject new profile row
        hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        cursor.execute("INSERT INTO users (username, password_hash) VALUES (%s, %s)", (username, hashed))
        conn.commit()
        
        cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        
    # SCENARIO 2: Standard Login Mode (Prevents accidental account generation)
    else:
        if not user:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Account not found. Please register first.")
            
        if not bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):
            cursor.close()
            conn.close()
            raise HTTPException(status_code=401, detail="Invalid security credentials.")
            
    cursor.close()
    conn.close()
    return {"user_id": user['id'], "username": user['username']}


# --- CORE AGGREGATOR ENGINE PIPELINES ---

@app.post("/api/summarize-audio")
async def summarize_audio_endpoint(
    user_id: int = Form(...), 
    meeting_date: str = Form(...), 
    audio_file: UploadFile = File(...)
):
    safe_filename = audio_file.filename
    file_location = os.path.join(UPLOAD_DIR, safe_filename)
    
    try:
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(audio_file.file, buffer)
        
        transcribed_text = await run_in_threadpool(transcribe_offline_audio, file_location)
        summary = await run_in_threadpool(generate_offline_summary, transcribed_text)
    finally:
        if os.path.exists(file_location):
            os.remove(file_location)
            
    return save_and_return_payload(user_id, meeting_date, transcribed_text, summary)


@app.post("/api/summarize-text")
async def summarize_text_endpoint(
    user_id: int = Form(...), 
    meeting_date: str = Form(...), 
    transcript: str = Form(...)
):
    summary = await run_in_threadpool(generate_offline_summary, transcript)
    return save_and_return_payload(user_id, meeting_date, transcript, summary)


def save_and_return_payload(user_id: int, meeting_date: str, transcript: str, summary: str):
    meeting_id = f"MEET-{uuid.uuid4().hex[:8].upper()}"
    pdf_filename = f"{meeting_id}_summary.pdf"
    
    build_pdf(summary, transcript, pdf_filename, meeting_date)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO summaries (meeting_id, user_id, meeting_date, raw_transcript, text_summary, pdf_filename) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (meeting_id, user_id, meeting_date, transcript, summary, pdf_filename)
    )
    conn.commit()
    cursor.close()
    conn.close()
    
    return {
        "meeting_id": meeting_id,
        "meeting_date": meeting_date,
        "summary": summary,
        "transcript": transcript,
        "pdfUrl": f"/download-pdf/{pdf_filename}"
    }


# --- HISTORICAL DATA EXTRACTION ---

@app.get("/api/history/{user_id}")
def fetch_user_history(user_id: int):
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute(
        "SELECT meeting_id, meeting_date, text_summary as summary, raw_transcript as transcript, "
        "CONCAT('/download-pdf/', pdf_filename) as pdfUrl FROM summaries WHERE user_id = %s "
        "ORDER BY created_at DESC", (user_id,)
    )
    history = cursor.fetchall()
    
    cursor.close()
    conn.close()
    return history


@app.get("/download-pdf/{filename}")
def download_pdf_endpoint(filename: str):
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File asset path non-existent.")
    return FileResponse(file_path, media_type='application/pdf', filename=filename)


def send_email_worker(recipient: str, pdf_filename: str, decoded_summary: str):
    pdf_path = os.path.join(OUTPUT_DIR, pdf_filename)
    msg = MIMEMultipart()
    msg['From'] = SENDER_EMAIL
    msg['To'] = recipient
    msg['Subject'] = "Meeting Minutes Report"
    msg.attach(MIMEText(f"Find your minutes attached.\n\nSummary:\n\n{decoded_summary}", 'plain'))
    
    if os.path.exists(pdf_path):
        with open(pdf_path, "rb") as f:
            ext_file = MIMEApplication(f.read(), _subtype="pdf")
            ext_file.add_header('Content-Disposition', 'attachment', filename=pdf_filename)
            msg.attach(ext_file)
    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=5)
        server.sendmail(SENDER_EMAIL, recipient, msg.as_string())
        server.quit()
    except Exception:
        pass

@app.post("/api/send-email")
def send_email_endpoint(background_tasks: BackgroundTasks, recipient: str = Form(...), pdf_filename: str = Form(...), summary_text: str = Form(...)):
    background_tasks.add_task(send_email_worker, recipient, pdf_filename, summary_text)
    return {"status": "Dispatched to background process pipeline."}