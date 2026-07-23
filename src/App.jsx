import React, { useState, useEffect } from 'react';
import { Settings, Copy, X, Crown, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Tesseract from 'tesseract.js';

function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
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

  // Save settings
  useEffect(() => {
    localStorage.setItem('gemini_api_key', apiKey);
    localStorage.setItem('auto_ask', autoAsk);
  }, [apiKey, autoAsk]);

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
      setOutputText('Please enter your Gemini API Key in the settings.');
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
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
      const parts = [];
      parts.push({
        text: "You are an expert C++ programming tutor. Analyze the image, read the question clearly, and provide clean, correct solution with explanation."
      });
      
      if (textToSend) {
        parts.push({ text: `Additional context/question from user: ${textToSend}` });
      }

      if (imageToSend) {
        const base64Data = imageToSend.split(',')[1];
        parts.push({
          inlineData: { mimeType: 'image/png', data: base64Data }
        });
      }

      const requestBody = { contents: [{ parts }] };
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to fetch from Gemini');
      }

      const reply = data.candidates[0]?.content?.parts[0]?.text || 'No response generated.';
      setOutputText(reply);
      
    } catch (err) {
      console.error('Gemini error:', err);
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

  return (
    <div className="flex flex-col h-screen bg-black/50 backdrop-blur-xl text-white p-4 font-sans select-none relative overflow-hidden rounded-xl border border-white/10 shadow-2xl">
      
      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70" style={{ WebkitAppRegion: 'no-drag' }}>
          <div className="bg-brand-card p-6 rounded-xl border border-gray-700 w-80 shadow-2xl relative">
            <button onClick={() => setShowSettings(false)} className="absolute top-3 right-3 text-gray-400 hover:text-white">
              <X size={20} />
            </button>
            <h2 className="text-lg font-bold mb-4 text-brand-light-purple">Settings</h2>
            
            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1">Gemini API Key</label>
              <input 
                type="password"
                className="w-full px-3 py-2 bg-brand-dark text-sm border border-gray-700 rounded outline-none focus:border-brand-purple"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
            
            <div className="mb-4 flex items-center justify-between">
              <label className="text-sm text-gray-300">Always On Top</label>
              <input 
                type="checkbox" 
                className="w-4 h-4 accent-brand-purple"
                checked={alwaysOnTop}
                onChange={(e) => setAlwaysOnTop(e.target.checked)}
              />
            </div>

            <div className="mb-4 flex items-center justify-between">
              <label className="text-sm text-gray-300">Auto Ask AI after OCR</label>
              <input 
                type="checkbox" 
                className="w-4 h-4 accent-brand-purple"
                checked={autoAsk}
                onChange={(e) => setAutoAsk(e.target.checked)}
              />
            </div>

            <div className="mb-2">
              <label className="flex justify-between text-sm text-gray-300 mb-1">
                <span>Window Opacity</span>
                <span>{Math.round(opacity * 100)}%</span>
              </label>
              <input 
                type="range" 
                min="0.6" max="1.0" step="0.05"
                className="w-full accent-brand-purple"
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
          <Sparkles className="text-pink-500 animate-pulse" size={20} />
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 bg-clip-text text-transparent drop-shadow-md">
            cheaterBoy
          </h1>
        </div>
        <div className="flex space-x-3 items-center" style={{ WebkitAppRegion: 'no-drag' }}>
          <button 
            className="flex items-center space-x-1 bg-gradient-to-r from-amber-400 to-orange-500 text-black px-3 py-1.5 rounded-full text-xs font-bold shadow-lg hover:shadow-orange-500/50 hover:scale-105 transition-all"
            onClick={() => alert("Premium feature coming soon!")}
          >
            <Crown size={14} />
            <span>Buy Premium</span>
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="text-gray-300 hover:text-white transition-colors bg-white/10 p-1.5 rounded-full hover:bg-white/20"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col space-y-3 overflow-hidden mt-2" style={{ WebkitAppRegion: 'no-drag' }}>
        
        {/* Input Area */}
        <div className="flex flex-col h-1/4 bg-white/5 rounded-xl p-2 shadow-inner border border-white/10 focus-within:border-pink-500/50 focus-within:bg-white/10 transition-all relative backdrop-blur-md">
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
            className="flex-1 w-full p-2 bg-transparent resize-none outline-none text-sm placeholder-gray-500 no-scrollbar"
            placeholder="Type your question here, or paste clipboard contents..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </div>

        {/* Output Area */}
        <div className="flex flex-col h-3/4 bg-white/5 rounded-xl shadow-inner border border-white/10 overflow-hidden relative backdrop-blur-md">
          {/* Top Bar of Output */}
          <div className="bg-black/40 border-b border-white/10 p-2 flex justify-between items-center backdrop-blur-sm">
            <span className="text-[10px] text-pink-400 uppercase tracking-widest font-bold">cheaterBoy AI</span>
            <button 
              onClick={handleCopy}
              className="text-gray-400 hover:text-white transition-colors p-1"
              title="Copy Response"
            >
              <Copy size={14} />
            </button>
          </div>

          {isLoading && (
            <div className="w-full h-1 bg-gray-800">
              <div className="h-full bg-brand-purple animate-pulse" style={{ width: '100%' }}></div>
            </div>
          )}
          
          <div className="flex-1 p-4 overflow-y-auto no-scrollbar">
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
                        <code {...props} className="bg-gray-800 px-1 py-0.5 rounded text-brand-light-purple">
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
              <div className="flex h-full items-center justify-center text-gray-600 text-sm italic">
                {outputText || 'AI response will appear here...'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="mt-4 flex flex-wrap gap-2" style={{ WebkitAppRegion: 'no-drag' }}>
        <button 
          onClick={() => handleCapture('full')}
          className="flex-1 bg-white/10 hover:bg-white/20 text-gray-200 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all border border-white/10 shadow hover:shadow-lg backdrop-blur-sm"
        >
          Screen (F1)
        </button>
        <button 
          onClick={() => handleCapture('region')}
          className="flex-1 bg-white/10 hover:bg-white/20 text-gray-200 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all border border-white/10 shadow hover:shadow-lg backdrop-blur-sm"
        >
          Region (F4)
        </button>
        <button 
          onClick={() => handleAskAI()}
          disabled={isLoading}
          className={`flex-1 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-400 hover:to-purple-500 text-white py-2.5 px-2 rounded-lg text-xs font-bold transition-all shadow-lg shadow-purple-500/30 ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02]'}`}
        >
          Ask (F3)
        </button>
        <button 
          onClick={handlePaste}
          className="flex-1 bg-white/10 hover:bg-white/20 text-gray-200 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all border border-white/10 shadow hover:shadow-lg backdrop-blur-sm"
        >
          Paste
        </button>
        <button 
          onClick={handleClear}
          className="flex-1 bg-white/10 hover:bg-white/20 text-gray-200 py-2.5 px-2 rounded-lg text-xs font-semibold transition-all border border-white/10 shadow hover:shadow-lg backdrop-blur-sm"
        >
          Clear
        </button>
      </div>

      {/* Footer */}
      <div className="mt-3 text-center w-full">
        <p className="text-[10px] text-gray-500 tracking-wider uppercase font-medium drop-shadow-sm">
          developed by prince yadav
        </p>
      </div>
    </div>
  );
}

export default App;
