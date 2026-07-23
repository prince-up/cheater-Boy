
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { Settings, Copy, X, Minus, Sparkles, Mic, MicOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Tesseract from 'tesseract.js';

function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('groq_api_key') || '');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [screenshotData, setScreenshotData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // New State
  const [showSettings, setShowSettings] = useState(false);
  const [opacity, setOpacity] = useState(1.0);
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [autoAsk, setAutoAsk] = useState(() => localStorage.getItem('auto_ask') === 'true');
  const [ocrProgress, setOcrProgress] = useState('');
  const [resumeText, setResumeText] = useState(() => localStorage.getItem('resume_text') || '');
  const [interviewCount, setInterviewCount] = useState(() => parseInt(localStorage.getItem('interview_count')) || 0);

  // Speech Recognition Hook
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();
  
  // Sync transcript to input text
  useEffect(() => {
    if (listening && transcript) {
      setInputText(transcript);
    }
  }, [transcript, listening]);

  // Save settings
  useEffect(() => {
    localStorage.setItem('groq_api_key', apiKey);
    localStorage.setItem('auto_ask', autoAsk);
    localStorage.setItem('resume_text', resumeText);
    localStorage.setItem('interview_count', interviewCount);
  }, [apiKey, autoAsk, resumeText, interviewCount]);

  useEffect(() => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('set-opacity', parseFloat(opacity));
    }
  }, [opacity]);

  useEffect(() => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('toggle-always-on-top', alwaysOnTop);
    }
  }, [alwaysOnTop]);

  // Handle hotkeys
  useEffect(() => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      
      const handleShortcut = (event, shortcut) => {
        if (shortcut === 'F1') {
          handleCapture('full');
        } else if (shortcut === 'F4') {
          handleCapture('region');
        } else if (shortcut === 'F3') {
          handleAskAI();
        }
      };

      ipcRenderer.on('shortcut-triggered', handleShortcut);
      return () => {
        ipcRenderer.removeListener('shortcut-triggered', handleShortcut);
      };
    }
  }, [screenshotData, inputText, apiKey, isLoading, opacity, alwaysOnTop, autoAsk]);

  const handleCapture = async (type = 'full') => {
    if (window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        const channel = type === 'region' ? 'start-region-capture' : 'capture-screen';
        
        // Hide window temporarily for region capture
        if (type === 'region') ipcRenderer.send('set-opacity', 0);
        
        const dataUrl = await ipcRenderer.invoke(channel);
        
        if (type === 'region') ipcRenderer.send('set-opacity', parseFloat(opacity));

        if (dataUrl) {
          setScreenshotData(dataUrl);
          setOutputText('Screen captured successfully. Extracting text...');
          
          // Run Tesseract OCR
          setOcrProgress('Running OCR...');
          let extractedText = '';
          try {
            const result = await Tesseract.recognize(dataUrl, 'eng');
            extractedText = result.data.text.trim();
            if (extractedText) {
              setInputText((prev) => prev + (prev ? '\n\n' : '') + extractedText);
            }
            
            if (autoAsk) {
              setOutputText('Screen captured and text extracted. Auto-asking AI...');
              handleAskAI(extractedText, dataUrl);
            } else {
              setOutputText('Screen captured and text extracted. Press Ask AI (F3) to analyze.');
            }
          } catch (ocrErr) {
            console.error('OCR Error:', ocrErr);
            setOutputText('Screen captured, but OCR failed. Press Ask AI (F3) to analyze.');
          } finally {
            setOcrProgress('');
          }
        } else {
          setOutputText('Failed to capture screen or cancelled.');
        }
      } catch (err) {
        console.error('Capture error:', err);
        setOutputText('Error during screen capture.');
      }
    }
  };

  const handleAskAI = async (overrideText = null, overrideImage = null) => {
    if (isLoading) return;
    if (!apiKey) {
      setOutputText('Please enter your Groq API Key in the settings.');
      return;
    }
    
    const textToSend = overrideText !== null ? (inputText + (inputText ? '\n\n' : '') + overrideText) : inputText;
    const imageToSend = overrideImage || screenshotData;

    if (!textToSend && !imageToSend) {
      setOutputText('Please provide either an image (Capture) or type a question.');
      return;
    }

    setIsLoading(true);
    setOutputText('Analyzing...');

    try {
      const url = `https://api.groq.com/openai/v1/chat/completions`;
      
      const content = [];
      let promptText = "You are an expert interview assistant helping a candidate in real-time. Provide clear, professional, and well-structured answers suitable for speaking in an interview. Use bullet points for readability. Keep it concise and to the point, avoiding unnecessary fluff, but ensure the answer is comprehensive enough to impress an interviewer.";
      
      if (resumeText) {
        promptText += `\n\nContext: The user's resume is provided below. Answer any questions keeping this resume in mind. Do not mention the resume unless directly relevant to the answer.\n\nResume:\n${resumeText}`;
      }
      
      if (textToSend) {
        promptText += `\n\nQuestion/Context from user: ${textToSend}`;
      }

      content.push({ type: 'text', text: promptText });

      if (imageToSend) {
        content.push({
          type: 'image_url',
          image_url: { url: imageToSend }
        });
      }

      const requestBody = { 
        model: imageToSend ? 'llama-3.2-90b-vision-preview' : 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content }] 
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to fetch from Groq');
      }

      const reply = data.choices?.[0]?.message?.content || 'No response generated.';
      setOutputText(reply);
      setInterviewCount(prev => prev + 1);
      
    } catch (err) {
      console.error('Groq error:', err);
      setOutputText(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (outputText) {
      navigator.clipboard.writeText(outputText);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setInputText((prev) => prev + (prev ? '\n' : '') + text);
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  const handleClear = () => {
    setInputText('');
    setOutputText('');
    setScreenshotData(null);
    resetTranscript();
  };

  const handleListen = () => {
    if (!browserSupportsSpeechRecognition) {
      setOutputText('Browser doesn\'t support speech recognition in this environment.');
      return;
    }
    
    if (listening) {
      SpeechRecognition.stopListening();
      setOutputText('Stopped listening. Click Ask (F3) to generate an answer.');
    } else {
      resetTranscript();
      setInputText('');
      SpeechRecognition.startListening({ continuous: true, language: 'en-US' });
      setOutputText('Listening to microphone... Speak now.');
    }
  };

  const handleMinimize = () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('minimize-window');
    }
  };

  const handleClose = () => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('close-window');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black/60 backdrop-blur-3xl text-gray-100 p-4 font-sans select-none relative overflow-hidden rounded-2xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" style={{ WebkitAppRegion: 'no-drag' }}>
          <div className="bg-[#1a1a24]/90 p-6 rounded-2xl border border-white/10 w-96 max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <button onClick={() => setShowSettings(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-full transition-all">
              <X size={18} />
            </button>
            <h2 className="text-xl font-bold mb-6 text-white bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Preferences</h2>
            
            <div className="mb-5">
              <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Groq API Key</label>
              <input 
                type="password"
                className="w-full px-4 py-2.5 bg-black/40 text-sm border border-white/10 rounded-xl outline-none focus:border-indigo-500 text-white placeholder-gray-600 transition-colors"
                placeholder="gsk_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            
            <div className="mb-5">
              <label className="block text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wider">Your Resume</label>
              <textarea 
                className="w-full h-32 px-4 py-2.5 bg-black/40 text-sm border border-white/10 rounded-xl outline-none focus:border-indigo-500 text-gray-300 resize-none transition-colors"
                placeholder="Paste your resume here..."
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
              />
            </div>
            
            <div className="mb-4 flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5">
              <label className="text-sm text-gray-300">Always On Top</label>
              <input 
                type="checkbox" 
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
                checked={alwaysOnTop}
                onChange={(e) => setAlwaysOnTop(e.target.checked)}
              />
            </div>

            <div className="mb-5 flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5">
              <label className="text-sm text-gray-300">Auto Ask AI</label>
              <input 
                type="checkbox" 
                className="w-4 h-4 accent-indigo-500 cursor-pointer"
                checked={autoAsk}
                onChange={(e) => setAutoAsk(e.target.checked)}
              />
            </div>

            <div className="mb-2 bg-black/20 p-4 rounded-xl border border-white/5">
              <label className="flex justify-between text-sm text-gray-300 mb-3">
                <span>Window Opacity</span>
                <span className="text-indigo-400 font-medium">{Math.round(opacity * 100)}%</span>
              </label>
              <input 
                type="range" 
                min="0.6" max="1.0" step="0.05"
                className="w-full accent-indigo-500 cursor-pointer"
                value={opacity}
                onChange={(e) => setOpacity(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center mb-4 cursor-default" style={{ WebkitAppRegion: 'drag' }}>
        <div className="flex items-center space-x-2">
          <Sparkles size={20} className="text-indigo-400 animate-pulse" />
          <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent drop-shadow-sm">
            cheaterBoy
          </h1>
        </div>
        <div className="flex space-x-2 items-center" style={{ WebkitAppRegion: 'no-drag' }}>
          <span className="text-[10px] text-gray-400 bg-white/5 px-2.5 py-1 rounded-full border border-white/10 mr-1 shadow-inner font-medium uppercase tracking-wider">
            Uses: {interviewCount}
          </span>
          <button 
            onClick={() => setShowSettings(true)}
            className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/20 transition-all p-1.5 rounded-full"
          >
            <Settings size={16} />
          </button>
          <button 
            onClick={handleMinimize}
            className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/20 transition-all p-1.5 rounded-full"
          >
            <Minus size={16} />
          </button>
          <button 
            onClick={handleClose}
            className="text-gray-400 hover:text-white bg-white/5 hover:bg-red-500/80 transition-all p-1.5 rounded-full"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col space-y-3 overflow-hidden" style={{ WebkitAppRegion: 'no-drag' }}>
        
        {/* Input Area */}
        <div className="flex flex-col h-1/4 bg-white/5 rounded-2xl p-2 border border-white/10 shadow-inner focus-within:border-indigo-500/50 transition-all relative">
          {screenshotData && (
            <div className="absolute top-2 right-2 border border-gray-600 rounded overflow-hidden h-16 w-auto shadow z-10 group">
              <img src={screenshotData} alt="Captured" className="h-full object-contain bg-black" />
              <button 
                onClick={() => setScreenshotData(null)}
                className="absolute top-0 right-0 bg-red-600 hover:bg-red-700 text-white text-xs px-1.5 py-0.5 rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {ocrProgress && (
            <div className="absolute bottom-2 right-2 text-xs text-brand-light-purple animate-pulse">
              {ocrProgress}
            </div>
          )}
          <textarea
            className="flex-1 w-full p-2 bg-transparent resize-none outline-none text-sm text-gray-200 placeholder-gray-500 no-scrollbar"
            placeholder="Type your question or paste context..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </div>

        {/* Output Area */}
        <div className="flex flex-col h-3/4 bg-white/5 rounded-2xl border border-white/10 shadow-inner overflow-hidden relative">
          {/* Top Bar of Output */}
          <div className="bg-black/30 border-b border-white/5 p-2 flex justify-between items-center backdrop-blur-md">
            <span className="text-[10px] text-indigo-400 uppercase tracking-widest font-semibold pl-2">AI Response</span>
            <button 
              onClick={handleCopy}
              className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/20 transition-all p-1.5 rounded-md"
              title="Copy Response"
            >
              <Copy size={14} />
            </button>
          </div>

          {isLoading && (
            <div className="w-full h-1 bg-black/20">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 animate-pulse" style={{ width: '100%' }}></div>
            </div>
          )}
          
          <div className="flex-1 p-5 overflow-y-auto no-scrollbar">
            {outputText && !outputText.startsWith('Screen captured') && !outputText.startsWith('Analyzing...') && !outputText.startsWith('Error') && !outputText.startsWith('Please') ? (
              <div className="text-sm text-gray-200 select-text prose prose-invert prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    code({node, inline, className, children, ...props}) {
                      const match = /language-(\w+)/.exec(className || '')
                      return !inline && match ? (
                        <SyntaxHighlighter
                          {...props}
                          children={String(children).replace(/\n$/, '')}
                          style={atomDark}
                          language={match[1]}
                          PreTag="div"
                          className="rounded-md my-2 text-xs"
                        />
                      ) : (
                        <code {...props} className="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded-md font-mono text-xs border border-indigo-500/20">
                          {children}
                        </code>
                      )
                    }
                  }}
                >
                  {outputText}
                </ReactMarkdown>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-gray-500 text-sm italic">
                {outputText || 'Awaiting input...'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="mt-4 flex flex-wrap gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
        <button 
          onClick={() => handleCapture('full')}
          className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all border border-white/10 shadow-sm hover:shadow-md"
        >
          Screen (F1)
        </button>
        <button 
          onClick={() => handleCapture('region')}
          className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all border border-white/10 shadow-sm hover:shadow-md"
        >
          Region (F4)
        </button>
        <button 
          onClick={handleListen}
          className={`flex-1 flex items-center justify-center space-x-1 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all border shadow-sm hover:shadow-md ${listening ? 'bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30' : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'}`}
        >
          {listening ? <MicOff size={14} /> : <Mic size={14} />}
          <span>{listening ? 'Stop' : 'Listen'}</span>
        </button>
        <button 
          onClick={() => handleAskAI()}
          disabled={isLoading}
          className={`flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white py-2.5 px-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-500/25 border border-indigo-500/50 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02]'}`}
        >
          Ask (F3)
        </button>
        <button 
          onClick={handlePaste}
          className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all border border-white/10 shadow-sm hover:shadow-md"
        >
          Paste
        </button>
        <button 
          onClick={handleClear}
          className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all border border-white/10 shadow-sm hover:shadow-md"
        >
          Clear
        </button>
      </div>

      {/* Footer */}
      <div className="mt-3 text-center w-full">
        <p className="text-[10px] text-gray-500/80 tracking-widest uppercase font-medium">
          developed by prince yadav
        </p>
      </div>
    </div>
  );
}

export default App;
