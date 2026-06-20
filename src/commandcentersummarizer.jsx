import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, FileText, Send, Loader2, Download, Terminal, Upload, Calendar, ShieldCheck, Cpu, Layers, FileSignature, Lock, User, ShieldAlert, Fingerprint, LogOut, History, Clock } from 'lucide-react';

export default function App() {
  // Authentication & Session States
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Core App States
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [summaryData, setSummaryData] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  
  // Real History State (Starts completely empty)
  const [historicalSummaries, setHistoricalSummaries] = useState([]);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [isRecording]);

  const formatTimer = (totalSeconds) => {
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) return;
    
    setAuthLoading(true);
    // Mimics the server network delay before flipping state
    setTimeout(() => {
      setAuthLoading(false);
      setIsAuthenticated(true);
    }, 1000);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUsernameInput('');
    setPasswordInput('');
    setSummaryData(null);
    setHistoricalSummaries([]); // Wipe state on logout
  };

  const startRecording = async () => {
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await uploadAudioPipeline(audioBlob, `live_meeting_${meetingDate}_${Date.now()}.webm`);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone hardware access denied: " + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadAudioPipeline(file, file.name);
  };

  const uploadAudioPipeline = async (audioBlob, filename) => {
    setLoading(true);
    const formData = new FormData();
    formData.append('audio_file', audioBlob, `DATE-${meetingDate}_${filename}`);

    try {
      const response = await fetch('http://127.0.0.1:8000/summarize-audio', {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        const rawHtmlData = await response.text();
        extractDataFromBackendHtml(rawHtmlData);
      } else {
        alert("Audio pipeline processing failed.");
      }
    } catch (error) {
      alert("Network Connection Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const processTextPipeline = async (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    setLoading(true);

    try {
      const structuredPayload = `[MEETING DATE: ${meetingDate}]\n\n${textInput}`;
      const response = await fetch('http://127.0.0.1:8000/summarize-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 'transcript': structuredPayload })
      });

      if (response.ok) {
        const rawHtmlData = await response.text();
        extractDataFromBackendHtml(rawHtmlData);
      } else {
        alert("Text processing failed.");
      }
    } catch (error) {
      alert("Network Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const extractDataFromBackendHtml = (htmlString) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    
    const divs = doc.querySelectorAll('div > div');
    let summaryText = "";
    let transcriptText = "";
    
    if (divs.length >= 2) {
      summaryText = divs[0].innerText || divs[0].textContent;
      transcriptText = divs[1].innerText || divs[1].textContent;
    } else {
      const pageDivs = doc.querySelectorAll('div');
      if(pageDivs.length >= 2) {
        summaryText = pageDivs[1].innerText;
        transcriptText = pageDivs[2].innerText;
      }
    }

    const pdfAnchor = doc.querySelector('a[href^="/download-pdf/"]');
    const pdfPath = pdfAnchor ? pdfAnchor.getAttribute('href') : '#';

    // Generate real, trackable session IDs dynamically on creation
    const activeSessionId = `SESSION-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const visibleSummary = `📅 MEETING DATE: ${meetingDate}\n🔑 SESSION ID: ${activeSessionId}\n========================================\n\n${summaryText.trim()}`;

    const newResult = {
      summary: visibleSummary,
      transcript: transcriptText.trim(),
      pdfUrl: pdfPath
    };

    setSummaryData(newResult);

    // Save item directly into the interactive history layout real-time
    setHistoricalSummaries(prev => [
      { session_id: activeSessionId, date: meetingDate, summary: visibleSummary },
      ...prev
    ]);
    setTextInput('');
  };

  const sendEmailReport = async (e) => {
    e.preventDefault();
    if (!emailInput || !summaryData) return;
    setEmailStatus('Initializing secure SMTP relay routing...');

    try {
      const filename = summaryData.pdfUrl.split('/').pop();
      const response = await fetch('http://127.0.0.1:8000/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          'recipient': emailInput,
          'pdf_filename': filename,
          'summary_text': summaryData.summary
        })
      });

      if (response.ok) {
        setEmailStatus('✅ Summary dispatch transmitted successfully.');
      } else {
        setEmailStatus('❌ System SMTP routing rejection encountered.');
      }
    } catch (error) {
      setEmailStatus('❌ Transport connection loss: ' + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#040815] text-slate-200 font-sans antialiased selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes rocketAscent {
          0% { transform: translateY(115vh) translateX(-20px) scale(0.9); opacity: 0; }
          5% { opacity: 0.4; }
          70% { opacity: 0.35; }
          100% { transform: translateY(-30vh) translateX(40px) scale(1.05); opacity: 0; }
        }
        @keyframes plumeFlicker {
          0%, 100% { transform: scaleX(1) translateY(0px); opacity: 0.9; filter: blur(1px); }
          50% { transform: scaleX(1.2) translateY(2px); opacity: 1; filter: blur(0px); }
        }
        .animate-rocket { animation: rocketAscent 24s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .animate-plume { animation: plumeFlicker 0.15s ease-in-out infinite; }
        .bg-grid-pattern {
          background-size: 40px 40px;
          background-image: linear-gradient(to right, rgba(15, 32, 67, 0.35) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(15, 32, 67, 0.35) 1px, transparent 1px);
        }
      `}} />

      <div className="absolute inset-0 bg-grid-pattern [mask-image:radial-gradient(ellipse_80%_60%_at_50%_40%,#000_60%,transparent_100%)] pointer-events-none z-0" />
      
      <div className="absolute top-0 bottom-0 left-1/2 md:left-[70%] w-32 pointer-events-none z-0 hidden sm:block">
        <div className="absolute inset-0 animate-rocket flex flex-col items-center">
          <div className="w-4 h-16 bg-gradient-to-b from-cyan-400 via-slate-400 to-slate-600 rounded-t-full relative shadow-[0_0_20px_rgba(34,211,238,0.2)]">
            <div className="absolute bottom-0 -left-2 w-2 h-6 bg-cyan-600 rounded-bl-full" />
            <div className="absolute bottom-0 -right-2 w-2 h-6 bg-cyan-600 rounded-br-full" />
          </div>
          <div className="w-3 h-24 bg-gradient-to-b from-amber-400 via-orange-500 to-transparent rounded-t-full animate-plume mix-blend-screen shadow-[0_0_30px_rgba(245,158,11,0.8)]" />
        </div>
      </div>

      {!isAuthenticated ? (
        /* LOGIN HUB */
        <div className="min-h-screen flex items-center justify-center p-6 relative z-10">
          <div className="w-full max-w-md backdrop-blur-2xl bg-[#091129]/60 border border-slate-700/50 rounded-xl p-8 shadow-[0_20px_50px_rgba(0,0,0,0.7)] relative overflow-hidden group">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-cyan-500 via-blue-600 to-cyan-500" />
            
            <div className="flex flex-col items-center text-center mb-8">
              <div className="h-14 w-14 rounded-lg border border-cyan-500/40 bg-[#060b1a] flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(6,182,212,0.15)] relative">
                <Lock className="h-6 w-6 text-cyan-400 stroke-[1.5]" />
              </div>
              <h1 className="text-sm font-black tracking-[0.25em] text-white uppercase font-mono">Command Network</h1>
              <p className="text-[10px] text-cyan-500/60 font-mono tracking-widest uppercase mt-1">Terminal Access Protocol</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold block">Operator Username</label>
                <div className="flex items-center bg-[#040815]/90 border border-slate-800 rounded-lg px-3.5 py-2.5 focus-within:border-cyan-500/60 transition-all shadow-inner">
                  <User className="h-4 w-4 text-slate-500 mr-3 shrink-0" />
                  <input 
                    type="text"
                    required
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="Username..."
                    className="w-full bg-transparent text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none tracking-wide"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold block">Security Password</label>
                <div className="flex items-center bg-[#040815]/90 border border-slate-800 rounded-lg px-3.5 py-2.5 focus-within:border-cyan-500/60 transition-all shadow-inner">
                  <Lock className="h-4 w-4 text-slate-500 mr-3 shrink-0" />
                  <input 
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="•••••••••••••••"
                    className="w-full bg-transparent text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none tracking-widest"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 mt-2 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-mono text-xs font-black rounded-md shadow-lg transition-all duration-150 active:scale-[0.98] flex items-center justify-center space-x-2 border border-cyan-400/20 uppercase tracking-widest"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                    <span>Verifying Matrix...</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Authorize Terminal</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* MAIN APPLICATION MONITOR */
        <>
          <header className="border-b border-slate-800/60 bg-[#070e22]/90 backdrop-blur-xl sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="h-11 w-11 rounded border border-cyan-500/40 bg-gradient-to-b from-cyan-950/60 to-slate-900 flex items-center justify-center">
                  <Cpu className="h-5 w-5 text-cyan-400" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-black tracking-[0.28em] text-white font-mono uppercase">Control Consolidation Hub</span>
                    <span className="px-2 py-0.5 rounded text-[9px] font-black bg-cyan-950/80 text-cyan-400 font-mono border border-cyan-800/50 uppercase">OPERATOR: {usernameInput.toUpperCase()}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2.5 px-3 py-1.5 rounded border border-emerald-500/30 bg-emerald-950/20 text-emerald-400 font-mono text-xs">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="tracking-widest font-black text-[10px]">SECURE ACTIVE</span>
                </div>
                <button onClick={handleLogout} className="p-2 border border-slate-800 hover:border-rose-900/50 hover:bg-rose-950/20 rounded-md text-slate-400 hover:text-rose-400 transition-all font-mono text-xs flex items-center space-x-1.5">
                  <LogOut className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Terminate</span>
                </button>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
            {/* Control Panel */}
            <section className="lg:col-span-5 space-y-6">
              <div className="backdrop-blur-xl bg-[#091129]/40 border border-slate-700/40 rounded-lg p-4 flex items-center justify-between shadow-2xl">
                <div className="flex items-center space-x-3">
                  <Calendar className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-mono font-black text-slate-300 uppercase tracking-widest">Operation Date:</span>
                </div>
                <input 
                  type="date" 
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="bg-[#050917] border border-slate-800 text-cyan-400 rounded-md px-3 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
              
              <div className="backdrop-blur-xl bg-[#091129]/40 border border-slate-700/40 rounded-lg shadow-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/50 bg-[#101c3d]/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Layers className="h-3.5 w-3.5 text-cyan-400" />
                    <h2 className="text-xs uppercase tracking-[0.15em] font-black text-slate-200 font-mono">Real-Time Capture</h2>
                  </div>
                  {isRecording && (
                    <div className="flex items-center space-x-2 bg-rose-950/40 px-2.5 py-0.5 rounded border border-rose-900/50">
                      <span className="text-xs font-mono text-rose-400 font-black tracking-widest">{formatTimer(recordingSeconds)}</span>
                      <div className="h-2 w-2 rounded-full bg-rose-500 animate-ping" />
                    </div>
                  )}
                </div>
                
                <div className="p-5">
                  <div className="relative rounded-md bg-[#050917]/80 border border-slate-900/60 p-6 flex flex-col items-center justify-center min-h-[140px] shadow-inner">
                    {isRecording ? (
                      <>
                        <div className="h-12 w-12 rounded-full bg-rose-950/40 border-2 border-rose-500/40 flex items-center justify-center mb-3">
                          <Mic className="h-5 w-5 text-rose-400" />
                        </div>
                        <span className="text-[10px] font-mono text-rose-400 tracking-[0.15em] font-black uppercase">Ingesting Live Audio</span>
                      </>
                    ) : (
                      <>
                        <div className="h-11 w-11 rounded-lg bg-[#0b132c] border border-slate-800 flex items-center justify-center mb-3 text-slate-500">
                          <Mic className="h-4 w-4" />
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 tracking-widest font-bold uppercase">Receiver Grid: Idle</span>
                      </>
                    )}

                    <div className="mt-5 relative z-10">
                      {!isRecording ? (
                        <button type="button" onClick={startRecording} disabled={loading} className="px-5 py-2 bg-gradient-to-b from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white font-mono text-xs font-black rounded border border-cyan-500/30 uppercase tracking-widest">
                          <Mic className="h-3.5 w-3.5" /> <span>Initialize Recording</span>
                        </button>
                      ) : (
                        <button type="button" onClick={stopRecording} className="px-5 py-2 bg-gradient-to-b from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-mono text-xs font-black rounded border border-rose-500/30 uppercase tracking-widest">
                          <Square className="h-3.5 w-3.5" /> <span>Halt & Process</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-[#091129]/40 border border-slate-700/40 rounded-lg shadow-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/50 bg-[#101c3d]/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Upload className="h-3.5 w-3.5 text-cyan-400" />
                    <h2 className="text-xs uppercase tracking-[0.15em] font-black text-slate-200 font-mono">Binary Ingestion</h2>
                  </div>
                </div>
                <div className="p-5">
                  <label className="group flex flex-col items-center justify-center rounded-md bg-[#050917]/80 border-2 border-dashed border-slate-800/60 hover:border-cyan-500/40 p-5 text-center cursor-pointer transition-all min-h-[105px]">
                    <Upload className="h-5 w-5 text-slate-500 group-hover:text-cyan-400 mb-2" />
                    <span className="text-xs font-mono text-slate-300 group-hover:text-cyan-400 font-black tracking-wide">Upload Recording File</span>
                    <input type="file" accept="audio/*" disabled={loading || isRecording} onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-[#091129]/40 border border-slate-700/40 rounded-lg shadow-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/50 bg-[#101c3d]/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                    <h2 className="text-xs uppercase tracking-[0.15em] font-black text-slate-200 font-mono">Text Stream</h2>
                  </div>
                </div>
                <form onSubmit={processTextPipeline} className="p-5 space-y-4">
                  <div className="rounded bg-[#050917]/90 border border-slate-900 p-3 focus-within:border-cyan-500/50 transition-all">
                    <textarea
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      placeholder="Paste meeting logs or transcripts to process..."
                      className="w-full h-20 bg-transparent text-slate-200 placeholder-slate-600 text-xs font-mono focus:outline-none resize-none leading-relaxed"
                    />
                  </div>
                  <button type="submit" disabled={loading || !textInput.trim()} className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white font-mono text-xs font-black rounded border border-cyan-400/20 uppercase tracking-widest">
                    <Send className="h-3.5 w-3.5" /> <span>Generate Summary</span>
                  </button>
                </form>
              </div>
            </section>

            {/* Display / Logs Output Panel */}
            <section className="lg:col-span-7 space-y-6">
              <div className="backdrop-blur-xl bg-[#091129]/40 border border-slate-700/40 rounded-lg shadow-2xl overflow-hidden flex flex-col min-h-[460px]">
                <div className="px-6 py-3 border-b border-slate-800/50 bg-[#101c3d]/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-cyan-400" />
                    <h2 className="text-xs uppercase tracking-[0.15em] font-black text-slate-100 font-mono">Active Response Payload</h2>
                  </div>
                </div>

                {loading && (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-[#050917]/50">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mb-4" />
                    <p className="text-xs font-mono font-black tracking-widest text-cyan-400 uppercase">Processing Core Matrix Modules...</p>
                  </div>
                )}

                {!loading && !summaryData && (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 font-mono bg-[#050917]/20">
                    <Terminal className="h-6 w-6 text-slate-600 mb-2" />
                    <p className="text-[11px] font-black tracking-widest text-slate-400 uppercase">Terminal Standby: Processing Matrix Idle</p>
                  </div>
                )}

                {!loading && summaryData && (
                  <div className="flex-1 flex flex-col bg-[#050917]/90 overflow-hidden">
                    <div className="p-5 border-b border-slate-800/80 overflow-y-auto flex-1">
                      <div className="flex items-center space-x-2 mb-3">
                        <FileSignature className="h-3.5 w-3.5 text-cyan-500" />
                        <span className="text-[10px] font-mono font-black px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/50 uppercase">Active Document</span>
                      </div>
                      <div className="text-[13px] font-sans font-semibold text-[#1e293b] bg-[#f8fafc] border-l-4 border-cyan-600 rounded-r-lg p-5 whitespace-pre-wrap shadow-lg">
                        {summaryData.summary}
                      </div>
                    </div>

                    <div className="p-4 bg-[#091129] space-y-3 border-t border-slate-800/50">
                      <a href={`http://127.0.0.1:8000${summaryData.pdfUrl}`} download className="w-full py-2 bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white rounded font-mono text-xs font-black flex items-center justify-center space-x-2 tracking-widest uppercase">
                        <Download className="h-3.5 w-3.5" /> <span>Export Generated Asset</span>
                      </a>

                      <form onSubmit={sendEmailReport} className="border border-slate-800 bg-[#050917]/90 p-3 rounded space-y-2">
                        <div className="flex space-x-3">
                          <input
                            type="email"
                            required
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder="officer@network.internal"
                            className="flex-1 px-3 py-1.5 bg-[#0b132c] border border-slate-800 rounded text-xs font-mono focus:outline-none focus:border-cyan-500 text-slate-100 placeholder-slate-600"
                          />
                          <button type="submit" className="px-4 py-1.5 bg-[#121f44] text-cyan-400 border border-cyan-900/60 rounded text-xs font-mono font-black uppercase">
                            Dispatch
                          </button>
                        </div>
                        {emailStatus && <p className="text-[9px] font-mono text-cyan-400 tracking-tight">{emailStatus}</p>}
                      </form>
                    </div>
                  </div>
                )}
              </div>

              {/* REAL DATA HISTORY TRAY */}
              <div className="backdrop-blur-xl bg-[#091129]/40 border border-slate-700/40 rounded-lg shadow-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/50 bg-[#101c3d]/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <History className="h-4 w-4 text-cyan-500" />
                    <h3 className="text-xs uppercase tracking-[0.15em] font-black text-slate-200 font-mono">Historical Session Vault ({usernameInput || 'No Active Session'})</h3>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-[#040815] font-mono font-bold text-slate-500 uppercase tracking-widest">Live Sync</span>
                </div>
                
                <div className="p-5 max-h-[220px] overflow-y-auto space-y-3 bg-[#050917]/40 min-h-[100px] flex flex-col justify-center">
                  {historicalSummaries.length === 0 ? (
                    <div className="text-center text-slate-600 font-mono text-[11px] uppercase tracking-wider py-4">
                      No dynamic sessions stored for this connection instance.
                    </div>
                  ) : (
                    <div className="space-y-3 w-full">
                      {historicalSummaries.map((item, index) => (
                        <div key={index} className="p-3 bg-[#050917] border border-slate-800/80 hover:border-cyan-500/30 rounded flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-all">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2 text-[11px] font-mono">
                              <span className="text-cyan-400 font-black tracking-wide">{item.session_id}</span>
                              <span className="text-slate-600">•</span>
                              <div className="flex items-center text-slate-500 space-x-1">
                                <Clock className="h-3 w-3" />
                                <span>{item.date}</span>
                              </div>
                            </div>
                            <p className="text-[11px] font-sans text-slate-400 line-clamp-2 leading-relaxed pl-1.5 border-l border-slate-800">
                              {item.summary.split('========================================\n\n')[1] || item.summary}
                            </p>
                          </div>
                          <button 
                            onClick={() => setSummaryData({ summary: item.summary, transcript: "", pdfUrl: "#" })}
                            className="px-2.5 py-1 text-[10px] bg-[#0b132c] border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-400 font-mono font-bold uppercase rounded shrink-0 transition-all self-end sm:self-center"
                          >
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </main>
        </>
      )}
    </div>
  );
}