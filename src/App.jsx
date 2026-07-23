import React, { useState, useEffect } from 'react';
import { Settings, Copy, X, Minus, Terminal } from 'lucide-react';
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
    <div className="flex flex-col h-screen bg-black text-green-500 p-4 font-mono select-none relative overflow-hidden border-2 border-green-900">
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-95" style={{ WebkitAppRegion: 'no-drag' }}>
          <div className="bg-black p-6 border border-green-700 w-96 max-h-[90vh] overflow-y-auto relative">
            <button onClick={() => setShowSettings(false)} className="absolute top-3 right-3 text-green-700 hover:text-green-400">
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold mb-4 text-green-500 uppercase tracking-widest">Settings</h2>
            
            <div className="mb-4">
              <label className="block text-xs text-green-700 mb-1">Groq API Key</label>
              <input 
                type="password"
                className="w-full px-3 py-2 bg-black text-sm border border-green-900 outline-none focus:border-green-500 text-green-400 placeholder-green-900"
                placeholder="gsk_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-xs text-green-700 mb-1">Your Resume (Text Format)</label>
              <textarea 
                className="w-full h-32 px-3 py-2 bg-black text-xs border border-green-900 outline-none focus:border-green-500 text-green-400 resize-none"
                placeholder="Paste your resume here..."
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
              />
            </div>
            
            <div className="mb-4 flex items-center justify-between">
              <label className="text-sm text-green-600">Always On Top</label>
              <input 
                type="checkbox" 
                className="w-4 h-4 accent-green-500"
                checked={alwaysOnTop}
                onChange={(e) => setAlwaysOnTop(e.target.checked)}
              />
            </div>

            <div className="mb-4 flex items-center justify-between">
              <label className="text-sm text-green-600">Auto Ask AI after OCR</label>
              <input 
                type="checkbox" 
                className="w-4 h-4 accent-green-500"
                checked={autoAsk}
                onChange={(e) => setAutoAsk(e.target.checked)}
              />
            </div>

            <div className="mb-2">
              <label className="flex justify-between text-sm text-green-600 mb-1">
                <span>Window Opacity</span>
                <span>{Math.round(opacity * 100)}%</span>
              </label>
              <input 
                type="range" 
                min="0.6" max="1.0" step="0.05"
                className="w-full accent-green-500"
                value={opacity}
                onChange={(e) => setOpacity(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex justify-between items-center mb-3 cursor-default" style={{ WebkitAppRegion: 'drag' }}>
        <div className="flex items-center space-x-2">
          <Terminal size={18} className="text-green-500" />
          <h1 className="text-lg font-bold text-green-500 tracking-widest uppercase">
            cheaterBoy_OS
          </h1>
        </div>
        <div className="flex space-x-2 items-center" style={{ WebkitAppRegion: 'no-drag' }}>
          <span className="text-[10px] text-green-700 border border-green-900 px-2 py-1 mr-2">
            CMD_COUNT: {interviewCount}
          </span>
          <button 
            onClick={() => setShowSettings(true)}
            className="text-green-700 hover:text-green-400 transition-colors p-1"
          >
            <Settings size={16} />
          </button>
          <button 
            onClick={handleMinimize}
            className="text-green-700 hover:text-green-400 transition-colors p-1"
          >
            <Minus size={16} />
          </button>
          <button 
            onClick={handleClose}
            className="text-green-700 hover:text-red-500 transition-colors p-1"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col space-y-3 overflow-hidden mt-2" style={{ WebkitAppRegion: 'no-drag' }}>
        
        {/* Input Area */}
        <div className="flex flex-col h-1/4 bg-black p-2 border border-green-900 focus-within:border-green-500 transition-colors relative">
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
            className="flex-1 w-full p-2 bg-transparent resize-none outline-none text-sm text-green-500 placeholder-green-900 no-scrollbar"
            placeholder="root@cheaterBoy:~# enter command or text..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </div>

        {/* Output Area */}
        <div className="flex flex-col h-3/4 bg-black border border-green-900 overflow-hidden relative">
          {/* Top Bar of Output */}
          <div className="bg-[#051105] border-b border-green-900 p-1.5 flex justify-between items-center">
            <span className="text-[10px] text-green-700 uppercase tracking-widest font-bold">root@cheaterBoy:~# output</span>
            <button 
              onClick={handleCopy}
              className="text-green-700 hover:text-green-400 transition-colors p-1"
              title="Copy Response"
            >
              <Copy size={14} />
            </button>
          </div>

          {isLoading && (
            <div className="w-full h-1 bg-black">
              <div className="h-full bg-green-500 animate-pulse" style={{ width: '100%' }}></div>
            </div>
          )}
          
          <div className="flex-1 p-4 overflow-y-auto no-scrollbar">
            {outputText && !outputText.startsWith('Screen captured') && !outputText.startsWith('Analyzing...') && !outputText.startsWith('Error') && !outputText.startsWith('Please') ? (
              <div className="text-sm text-green-400 select-text prose prose-invert prose-sm max-w-none">
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
                        <code {...props} className="text-green-300 px-1 py-0.5">
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
              <div className="flex h-full items-center justify-center text-green-900 text-sm">
                {outputText || 'system waiting for input...'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="mt-4 flex flex-wrap gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
        <button 
          onClick={() => handleCapture('full')}
          className="flex-1 bg-black hover:bg-[#051105] text-green-500 py-2 px-2 text-xs font-mono font-bold transition-all border border-green-900 hover:border-green-500"
        >
          [SCREEN_F1]
        </button>
        <button 
          onClick={() => handleCapture('region')}
          className="flex-1 bg-black hover:bg-[#051105] text-green-500 py-2 px-2 text-xs font-mono font-bold transition-all border border-green-900 hover:border-green-500"
        >
          [REGION_F4]
        </button>
        <button 
          onClick={() => handleAskAI()}
          disabled={isLoading}
          className={`flex-1 bg-green-900 hover:bg-green-700 text-black py-2 px-2 text-xs font-mono font-bold transition-all border border-green-500 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          [EXECUTE_F3]
        </button>
        <button 
          onClick={handlePaste}
          className="flex-1 bg-black hover:bg-[#051105] text-green-500 py-2 px-2 text-xs font-mono font-bold transition-all border border-green-900 hover:border-green-500"
        >
          [PASTE]
        </button>
        <button 
          onClick={handleClear}
          className="flex-1 bg-black hover:bg-[#051105] text-green-500 py-2 px-2 text-xs font-mono font-bold transition-all border border-green-900 hover:border-green-500"
        >
          [CLEAR]
        </button>
      </div>

      {/* Footer */}
      <div className="mt-3 text-center w-full">
        <p className="text-[10px] text-green-900 tracking-widest uppercase font-mono">
          system init by prince yadav
        </p>
      </div>
    </div>
  );
}

export default App;
