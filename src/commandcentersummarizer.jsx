import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, FileText, Send, Loader2, Download, Terminal, Upload, Calendar, ShieldCheck, Cpu, Layers, FileSignature, Lock, User, ShieldAlert, LogOut, History, Clock, UserPlus } from 'lucide-react';

export default function App() {
  const [sessionUser, setSessionUser] = useState(null); 
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isSignupMode, setIsSignupMode] = useState(false); // 🆕 Controls registration vs authentication layout

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [summaryData, setSummaryData] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  
  const [historicalSummaries, setHistoricalSummaries] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

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
      clearInterval(timerIntervalRef.current);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [isRecording]);

  const syncHistoryVault = async (userId) => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/history/${userId}`);
      if (response.ok) {
        const historyData = await response.json();
        setHistoricalSummaries(historyData);
      }
    } catch (err) {
      console.error("Failed to sync structural asset data sets", err);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!usernameInput || !passwordInput) return;
    setAuthLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 
          username: usernameInput, 
          password: passwordInput,
          is_signup: isSignupMode ? 'true' : 'false' // 🆕 Sends registration condition state flag to main.py
        })
      });

      const responseData = await response.json();

      if (response.ok) {
        setSessionUser(responseData);
        if (isSignupMode) {
          alert("Account structural block registered successfully! Automatically logging in...");
          setIsSignupMode(false);
        }
        await syncHistoryVault(responseData.user_id);
      } else {
        alert(responseData.detail || "Authentication credentials rejected.");
      }
    } catch (error) {
      alert("Database link connection error.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setSessionUser(null);
    setUsernameInput('');
    setPasswordInput('');
    setSummaryData(null);
    setHistoricalSummaries([]);
    setShowHistoryModal(false);
    setIsSignupMode(false);
  };

  const startRecording = async () => {
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current.ondataavailable = (e) => chunksRef.current.push(e.data);
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await uploadAudioPipeline(audioBlob, `live_audio.webm`);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone hardware connection failure.");
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
    formData.append('user_id', sessionUser.user_id);
    formData.append('meeting_date', meetingDate);
    formData.append('audio_file', audioBlob, filename);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/summarize-audio', {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        const result = await response.json();
        setSummaryData(result);
        await syncHistoryVault(sessionUser.user_id);
      } else {
        alert("Pipeline calculation rejection error.");
      }
    } catch (error) {
      alert("Network exception layer encountered.");
    } finally {
      setLoading(false);
    }
  };

  const processTextPipeline = async (e) => {
    e.preventDefault();
    if (!textInput.trim()) return;
    setLoading(true);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/summarize-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          user_id: sessionUser.user_id,
          meeting_date: meetingDate,
          transcript: textInput
        })
      });

      if (response.ok) {
        const result = await response.json();
        setSummaryData(result);
        setTextInput('');
        await syncHistoryVault(sessionUser.user_id);
      }
    } catch (error) {
      alert("Text generation framework error.");
    } finally {
      setLoading(false);
    }
  };

  const sendEmailReport = async (e) => {
    e.preventDefault();
    if (!emailInput || !summaryData) return;
    setEmailStatus('SMTP Routing payload processing...');

    try {
      const filename = summaryData.pdfUrl.split('/').pop();
      const response = await fetch('http://127.0.0.1:8000/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          recipient: emailInput,
          pdf_filename: filename,
          summary_text: summaryData.summary
        })
      });
      if (response.ok) setEmailStatus('✅ Transmitted securely.');
    } catch (error) {
      setEmailStatus('❌ Routing transport channel error.');
    }
  };

  return (
    <div className="min-h-screen bg-[#040815] text-slate-200 font-sans antialiased relative overflow-x-hidden">
      {!sessionUser ? (
        /* AUTH ENTRY GATEWAY */
        <div className="min-h-screen flex items-center justify-center p-6 relative z-10">
          <div className="w-full max-w-md backdrop-blur-2xl bg-[#091129]/60 border border-slate-700/50 rounded-xl p-8 shadow-2xl relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${isSignupMode ? 'from-emerald-500 via-teal-600 to-emerald-500' : 'from-cyan-500 via-blue-600 to-cyan-500'}`} />
            <div className="flex flex-col items-center text-center mb-8">
              <div className={`h-14 w-14 rounded-lg border bg-[#060b1a] flex items-center justify-center mb-4 ${isSignupMode ? 'border-emerald-500/40' : 'border-cyan-500/40'}`}>
                {isSignupMode ? <UserPlus className="h-6 w-6 text-emerald-400" /> : <Lock className="h-6 w-6 text-cyan-400" />}
              </div>
              <h1 className="text-sm font-black tracking-[0.25em] text-white uppercase font-mono">
                {isSignupMode ? 'Account Initialization Protocol' : 'Secure Access Protocol'}
              </h1>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold block">Operator Handle</label>
                <div className="flex items-center bg-[#040815]/90 border border-slate-800 rounded-lg px-3.5 py-2.5">
                  <User className="h-4 w-4 text-slate-500 mr-3" />
                  <input type="text" required value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="Identifier..." className="w-full bg-transparent text-xs font-mono text-slate-200 focus:outline-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-400 uppercase tracking-widest font-bold block">Security Passphrase</label>
                <div className="flex items-center bg-[#040815]/90 border border-slate-800 rounded-lg px-3.5 py-2.5">
                  <Lock className="h-4 w-4 text-slate-500 mr-3" />
                  <input type="password" required value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="•••••••••••••" className="w-full bg-transparent text-xs font-mono text-slate-200 focus:outline-none" />
                </div>
              </div>

              {/* 🆕 Button automatically adapts text and gradient themes according to the selected mode state */}
              <button type="submit" disabled={authLoading} className={`w-full py-3 text-white font-mono text-xs font-black rounded shadow-lg uppercase tracking-widest flex items-center justify-center space-x-2 bg-gradient-to-r ${isSignupMode ? 'from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600' : 'from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600'}`}>
                {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>{isSignupMode ? 'Register New Profile' : 'Authenticate Client'}</span>}
              </button>
            </form>

            {/* 🆕 Mode selection switcher block */}
            <div className="mt-6 pt-5 border-t border-slate-800/60 text-center">
              <p className="text-[11px] font-mono text-slate-400">
                {isSignupMode ? "Already a recognized infrastructure node?" : "New operative targeting the network?"}
                <button
                  type="button"
                  onClick={() => setIsSignupMode(!isSignupMode)}
                  className={`ml-2 underline font-bold tracking-wider uppercase transition-colors text-[10px] ${isSignupMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                >
                  {isSignupMode ? "Execute Access Login" : "Initialize New Profile"}
                </button>
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ACTIVE CONTROL DASHBOARD */
        <>
          <header className="border-b border-slate-800/60 bg-[#070e22]/90 backdrop-blur-xl sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Cpu className="h-5 w-5 text-cyan-400" />
                <div>
                  <span className="text-xs font-black tracking-[0.28em] text-white font-mono uppercase">AI Minutes Aggregator</span>
                  <span className="ml-3 px-2 py-0.5 rounded text-[9px] bg-cyan-950 text-cyan-400 font-mono border border-cyan-800/50 uppercase">USER: {sessionUser.username}</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <button onClick={() => setShowHistoryModal(true)} className="px-3 py-1.5 border border-cyan-500/30 bg-cyan-950/20 text-cyan-400 font-mono text-xs flex items-center space-x-2 rounded hover:bg-cyan-950/50 transition-all">
                  <History className="h-4 w-4" />
                  <span className="tracking-wider text-[10px] font-bold">VIEW PREV SUMMARIES ({historicalSummaries.length})</span>
                </button>

                <button onClick={handleLogout} className="p-2 border border-slate-800 text-slate-400 hover:text-rose-400 rounded transition-all">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
            <section className="lg:col-span-5 space-y-6">
              <div className="backdrop-blur-xl bg-[#091129]/40 border border-slate-700/40 rounded-lg p-4 flex items-center justify-between shadow-2xl">
                <div className="flex items-center space-x-3">
                  <Calendar className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-mono font-black text-slate-300 uppercase tracking-widest">Session Execution Target Date:</span>
                </div>
                <input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="bg-[#050917] border border-slate-800 text-cyan-400 rounded px-3 py-1.5 text-xs font-mono font-bold focus:outline-none" />
              </div>
              
              <div className="backdrop-blur-xl bg-[#091129]/40 border border-slate-700/40 rounded-lg shadow-2xl p-5">
                <h2 className="text-xs uppercase tracking-widest font-black text-slate-200 font-mono mb-4">Real Time Audio Recorder</h2>
                <div className="rounded bg-[#050917]/80 border border-slate-900/60 p-6 flex flex-col items-center justify-center min-h-[120px]">
                  {isRecording ? <span className="text-[10px] font-mono text-rose-400 animate-pulse">RECORDING ACTIVE - INGESTING ({recordingSeconds}s)</span> : <span className="text-[10px] font-mono text-slate-500"></span>}
                  <div className="mt-4">
                    {!isRecording ? (
                      <button type="button" onClick={startRecording} disabled={loading} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs rounded uppercase tracking-widest">Start Transcribe Engine</button>
                    ) : (
                      <button type="button" onClick={stopRecording} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs rounded uppercase tracking-widest">Halt Pipeline</button>
                    )}
                  </div>
                </div>
                <label className="mt-4 flex flex-col items-center justify-center rounded bg-[#050917]/80 border border-dashed border-slate-800 p-4 text-center cursor-pointer hover:border-cyan-500/40">
                  <span className="text-xs font-mono text-slate-400">Or Inject Binary Audio Object File</span>
                  <input type="file" accept="audio/*" disabled={loading || isRecording} onChange={handleFileUpload} className="hidden" />
                </label>
              </div>

              <div className="backdrop-blur-xl bg-[#091129]/40 border border-slate-700/40 rounded-lg shadow-2xl p-5">
                <h2 className="text-xs uppercase tracking-widest font-black text-slate-200 font-mono mb-3">Direct Text summarizer</h2>
                <form onSubmit={processTextPipeline} className="space-y-3">
                  <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Paste operational script logs or raw text files..." className="w-full h-24 bg-[#050917]/90 border border-slate-900 p-3 text-slate-200 text-xs font-mono focus:outline-none rounded resize-none" />
                  <button type="submit" disabled={loading || !textInput.trim()} className="w-full py-2 bg-gradient-to-r from-cyan-600 to-cyan-700 text-white font-mono text-xs font-black rounded uppercase tracking-widest">Compute Matrix Profile</button>
                </form>
              </div>
            </section>

            <section className="lg:col-span-7">
              <div className="backdrop-blur-xl bg-[#091129]/40 border border-slate-700/40 rounded-lg shadow-2xl overflow-hidden flex flex-col min-h-[460px]">
                <div className="px-6 py-3 border-b border-slate-800/50 bg-[#101c3d]/60">
                  <h2 className="text-xs uppercase tracking-widest font-black text-slate-100 font-mono">Active Target Summary </h2>
                </div>

                {loading && (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 bg-[#050917]/50">
                    <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mb-2" />
                    <span className="text-xs font-mono text-cyan-400 tracking-widest uppercase">Calculating Transformer Weight Matrices...</span>
                  </div>
                )}

                {!loading && !summaryData && (
                  <div className="flex-1 flex items-center justify-center p-12 text-slate-500 font-mono text-xs uppercase tracking-widest">Interface Engine Standby Mode</div>
                )}

                {!loading && summaryData && (
                  <div className="flex-1 flex flex-col bg-[#050917]/90 p-5 overflow-y-auto">
                    <div className="mb-3 text-[11px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 rounded px-3 py-1.5">
                      IDENTIFIER ID: {summaryData.meeting_id} | DATE MATCHED: {summaryData.meeting_date}
                    </div>
                    <div className="flex-1 text-xs font-mono text-cyan-400 bg-[#050917] border border-slate-800/80 p-4 rounded whitespace-pre-wrap leading-relaxed shadow-inner">
                      {summaryData.summary}
                    </div>

                    <div className="mt-4 space-y-3">
                      <a href={`http://127.0.0.1:8000${summaryData.pdfUrl}`} download className="w-full py-2 bg-gradient-to-r from-cyan-600 to-cyan-700 text-white rounded font-mono text-xs font-black flex items-center justify-center space-x-2 tracking-widest uppercase">
                        <Download className="h-3.5 w-3.5" /> <span>Pull Document Payload Asset</span>
                      </a>
                      <form onSubmit={sendEmailReport} className="border border-slate-800 bg-[#050917]/90 p-3 rounded flex items-center space-x-3">
                        <input type="email" required value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="target@intranet.local" className="flex-1 px-3 py-1 bg-[#0b132c] border border-slate-800 rounded text-xs font-mono focus:outline-none text-slate-100" />
                        <button type="submit" className="px-4 py-1 bg-[#121f44] text-cyan-400 border border-cyan-900/60 rounded text-xs font-mono font-black uppercase">Relay</button>
                      </form>
                      {emailStatus && <p className="text-[9px] font-mono text-cyan-500 tracking-tight">{emailStatus}</p>}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </main>

          
          {showHistoryModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 z-50">
              <div className="w-full max-w-4xl bg-[#091129] border border-slate-800 rounded-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-[#101c3d]/40">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    <h3 className="text-xs uppercase tracking-widest font-black text-slate-200 font-mono">Account Isolated Data Vault Summary History</h3>
                  </div>
                  <button onClick={() => setShowHistoryModal(false)} className="text-slate-500 hover:text-white font-mono text-xs uppercase tracking-wider">Close Panel</button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-[#050917]/40 min-h-[200px]">
                  {historicalSummaries.length === 0 ? (
                    <div className="text-center text-slate-600 font-mono text-xs uppercase py-8">Zero database items associated with this secure user block profile.</div>
                  ) : (
                    historicalSummaries.map((item, index) => (
                      <div key={index} className="p-4 bg-[#050917] border border-slate-800/80 hover:border-cyan-500/20 rounded flex flex-col md:flex-row md:items-start justify-between gap-4 transition-all">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center space-x-3 text-[10px] font-mono">
                            <span className="text-cyan-400 font-black tracking-widest px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-900/40">{item.meeting_id}</span>
                            <div className="flex items-center text-slate-500 space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>{item.meeting_date}</span>
                            </div>
                          </div>
                          <p className="text-xs font-mono text-slate-400 line-clamp-3 leading-relaxed whitespace-pre-wrap pl-3 border-l-2 border-slate-800">
                            {item.summary}
                          </p>
                        </div>
                        <div className="flex md:flex-col items-stretch gap-2 shrink-0 self-end md:self-center w-full md:w-auto">
                          <button onClick={() => { setSummaryData(item); setShowHistoryModal(false); }} className="px-3 py-1.5 text-[10px] bg-[#121f44] border border-cyan-900/40 hover:border-cyan-500/40 text-cyan-400 font-mono font-bold uppercase rounded transition-all flex-1 text-center">Restore View</button>
                          {item.pdfUrl !== '#' && (
                            <a href={`http://127.0.0.1:8000${item.pdfUrl}`} download className="px-3 py-1.5 text-[10px] bg-[#070e22] border border-slate-800 hover:border-slate-700 text-slate-300 font-mono font-bold uppercase rounded transition-all text-center flex items-center justify-center gap-1"><Download className="h-3 w-3" /> PDF</a>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}