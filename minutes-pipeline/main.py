from fastapi import FastAPI, Form, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
import smtplib
import shutil
import os
import uuid
import urllib.parse
import re
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from faster_whisper import WhisperModel

# Explicit modular import from meeting_summarizer
from meeting_summariser import generate_offline_summary

app = FastAPI()

# --- CRITICAL SECURITY: ALLOW FRONTEND COMMUNICATION (CORS) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows your React dev server at http://localhost:5173 to connect
    allow_credentials=True,
    allow_methods=["*"],  # Allows GET, POST, OPTIONS requests
    allow_headers=["*"],  # Allows custom headers and multi-part data formatting
)

# --- CONFIGURATION ---
SMTP_SERVER = "192.168.1.10"  
SMTP_PORT = 25                
SENDER_EMAIL = "minutes-ai@company.local"
UPLOAD_DIR = "uploaded_audio"
OUTPUT_DIR = "generated_docs"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

print("[Audio Engine] Loading local Whisper Model...")
whisper_engine = WhisperModel("tiny", device="cpu", compute_type="int8")


def transcribe_offline_audio(audio_path: str) -> str:
    """Converts local audio files directly to text string offline."""
    print(f"[Audio Engine] Transcribing audio file: {audio_path}")
    segments, info = whisper_engine.transcribe(audio_path, beam_size=5)
    return " ".join([segment.text for segment in segments])


def build_pdf(summary_text: str, transcript_text: str, filename: str) -> str:
    """Generates a clean PDF file from the summary output with explicit meeting date headers."""
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    
    # Extract the meeting date from the filename string if available
    date_match = re.search(r"DATE-(\d{4}-\d{2}-\d{2})", filename)
    extracted_date = date_match.group(1) if date_match else "Unspecified Date"

    pdf_path = os.path.join(OUTPUT_DIR, filename)
    doc = SimpleDocTemplate(pdf_path, pagesize=letter, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    
    styles = getSampleStyleSheet()
    
    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        spaceAfter=6
    )
    
    heading_style = ParagraphStyle(
        'CustomHeading',
        parent=styles['Heading2'],
        fontSize=14,
        leading=18,
        spaceBefore=12,
        spaceAfter=6,
        keepWithNext=True
    )

    story = []
    story.append(Paragraph("<b>Official Meeting Minutes Report</b>", styles['Title']))
    # Print the specific targeted session meeting date right into the document subheader
    story.append(Paragraph(f"<font color='#555555'><b>Session Date:</b> {extracted_date}</font>", styles['Normal']))
    story.append(Spacer(1, 15))
    
    story.append(Paragraph("<b>AI-Generated Summary Dashboard</b>", heading_style))
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


@app.get("/", response_class=HTMLResponse)
def read_root():
    return "<h3>Intranet Voice Minutes AI Backend Matrix operational. Please interface via your frontend application node.</h3>"


@app.post("/summarize-audio", response_class=HTMLResponse)
async def summarize_audio_endpoint(audio_file: UploadFile = File(...)):
    # Keep the incoming filename pattern (which holds our date prefix) intact
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
            
    return display_results_page(transcribed_text, summary, safe_filename)


@app.post("/summarize-text", response_class=HTMLResponse)
async def summarize_text_endpoint(transcript: str = Form(...)):
    # Extract date if passed via textual ingestion block pattern
    date_match = re.search(r"\[MEETING DATE:\s*(\d{4}-\d{2}-\d{2})\]", transcript)
    date_str = date_match.group(1) if date_match else "Unspecified"
    
    # Strip metadata label before sending raw input to Ollama engine
    clean_transcript = re.sub(r"\[MEETING DATE:\s*\d{4}-\d{2}-\d{2}\]\s*", "", transcript)
    
    summary = await run_in_threadpool(generate_offline_summary, clean_transcript)
    
    virtual_filename = f"DATE-{date_str}_text_ingestion_{uuid.uuid4()}.pdf"
    return display_results_page(clean_transcript, summary, virtual_filename)


def display_results_page(transcript: str, summary: str, filename_context: str):
    """Generates the output dashboard wrapper while parsing data models securely."""
    doc_id = str(uuid.uuid4())
    
    # Extract date from incoming context to embed in output layout if needed
    date_match = re.search(r"DATE-(\d{4}-\d{2}-\d{2})", filename_context)
    date_str = f"DATE-{date_match.group(1)}_" if date_match else ""
    
    target_pdf_name = f"{date_str}summary_{doc_id}.pdf"
    build_pdf(summary, transcript, target_pdf_name)
    
    encoded_summary = urllib.parse.quote(summary)

    # Returning structured layout blocks that the DOMParser in commandcentersummarizer.jsx splits down cleanly
    return f"""
    <!DOCTYPE html>
    <html>
    <body>
        <div>
            <div>{summary}</div>
            <div>{transcript}</div>
        </div>
        <a href="/download-pdf/{target_pdf_name}">Download PDF</a>
    </body>
    </html>
    """


@app.get("/download-pdf/{filename}")
def download_pdf_endpoint(filename: str):
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Requested file not found.")
    return FileResponse(file_path, media_type='application/pdf', filename=filename)


@app.post("/send-email", response_class=HTMLResponse)
def send_email_endpoint(recipient: str = Form(...), pdf_filename: str = Form(...), summary_text: str = Form(...)):
    decoded_summary = urllib.parse.unquote(summary_text)
    pdf_path = os.path.join(OUTPUT_DIR, pdf_filename)
    
    msg = MIMEMultipart()
    msg['From'] = SENDER_EMAIL
    msg['To'] = recipient
    msg['Subject'] = "Meeting Minutes Report & Summary Attachment"
    
    body = f"Hello,\n\nPlease find attached the official PDF report for the meeting minutes.\n\nSummary Overview:\n\n{decoded_summary}"
    msg.attach(MIMEText(body, 'plain'))
    
    if os.path.exists(pdf_path):
        with open(pdf_path, "rb") as f:
            ext_file = MIMEApplication(f.read(), _subtype="pdf")
            ext_file.add_header('Content-Disposition', 'attachment', filename=pdf_filename)
            msg.attach(ext_file)
            
    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=5)
        server.sendmail(SENDER_EMAIL, recipient, msg.as_string())
        server.quit()
        status_message = "Success"
    except Exception as e:
        status_message = f"Error: {str(e)}"
        
    return f"<div>{status_message}</div>"