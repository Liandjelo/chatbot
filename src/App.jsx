import React, { useState, useEffect, useRef } from 'react';
import { Send, Menu, Plus, MessageSquare, Trash2, X, Bot, User, Loader2, Moon, Sun, Copy, Check } from 'lucide-react';

/**
 * UTILITIES & API HANDLING
 */

const API_KEY = "your-api-key"; // Environment provides this at runtime

// Exponential backoff retry logic
async function fetchWithRetry(url, options, retries = 3) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries > 0) {
      await new Promise(res => setTimeout(res, 1000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw err;
  }
}

const generateResponse = async (history, userMessage) => {
  const contents = history
    .filter(msg => !msg.isError)
    .map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-3.3-70b-instruct",
        messages: [
          { role: "user", content: userMessage } // ✅ FIXED
        ]
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || "API Error");
    }

    // OpenRouter uses: data.choices[0].message.content
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("No response generated");

    return text;
  } catch (error) {
    console.error("Generation error:", error);
    throw error;
  }
};

/**
 * COMPONENTS
 */

// Simple Markdown-like formatter for code blocks and bold text
const FormattedText = ({ text }) => {
  // Split by code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-sm md:text-base leading-relaxed break-words">
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          // Code block
          const content = part.replace(/^```\w*\n?/, '').replace(/```$/, '');
          const lang = part.match(/^```(\w*)/)?.[1] || 'Code';
          return (
            <div key={index} className="bg-slate-900 rounded-md overflow-hidden my-2 border border-slate-700 shadow-sm">
              <div className="flex justify-between items-center px-4 py-1.5 bg-slate-800 text-xs text-slate-400 border-b border-slate-700">
                <span className="uppercase font-semibold tracking-wider">{lang}</span>
                <button
                  onClick={() => {
                    document.execCommand('copy');
                    // fallback since navigator.clipboard usually blocked in iframes
                    const textArea = document.createElement("textarea");
                    textArea.value = content;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textArea);
                  }}
                  className="hover:text-white flex items-center gap-1 transition-colors"
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
              <pre className="p-4 overflow-x-auto text-slate-300 font-mono text-sm">
                <code>{content}</code>
              </pre>
            </div>
          );
        }

        // Regular text handling (bolding **text**)
        return (
          <p key={index} className="whitespace-pre-wrap">
            {part.split(/(\*\*.*?\*\*)/g).map((subPart, i) => {
              if (subPart.startsWith('**') && subPart.endsWith('**')) {
                return <strong key={i} className="font-bold">{subPart.slice(2, -2)}</strong>;
              }
              return subPart;
            })}
          </p>
        );
      })}
    </div>
  );
};

const ChatMessage = ({ message }) => {
  const isUser = message.sender === 'user';

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-6 group animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`flex max-w-[85%] md:max-w-[75%] gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

        {/* Avatar */}
        <div className={`
          flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm mt-1
          ${isUser ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}
        `}>
          {isUser ? <User size={16} /> : <Bot size={16} />}
        </div>

        {/* Bubble */}
        <div className={`
          flex flex-col 
          ${isUser ? 'items-end' : 'items-start'}
        `}>
          <div className={`
            px-5 py-3.5 rounded-2xl shadow-sm border
            ${isUser
              ? 'bg-indigo-600 text-white border-indigo-500 rounded-tr-sm'
              : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 rounded-tl-sm'
            }
          `}>
            {message.isTyping ? (
              <div className="flex gap-1 py-1 h-5 items-center">
                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></span>
              </div>
            ) : (
              <FormattedText text={message.text} />
            )}
          </div>

          {/* Timestamp or Error Label */}
          <div className="flex items-center gap-2 mt-1 px-1">
            <span className="text-[10px] text-slate-400 font-medium">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {message.isError && (
              <span className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                Failed to send
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  // State
  const [messages, setMessages] = useState([
    {
      id: 1,
      text: "Hello! I am your AI assistant. How can I help you today?",
      sender: 'bot',
      timestamp: new Date(),
      isError: false
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  // Refs
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Effects
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsgText = input.trim();
    setInput('');

    // 1. Add User Message
    const newUserMsg = {
      id: Date.now(),
      text: userMsgText,
      sender: 'user',
      timestamp: new Date(),
      isError: false
    };

    setMessages(prev => [...prev, newUserMsg]);
    setIsLoading(true);

    // 2. Add Temporary Loading Message
    const loadingId = Date.now() + 1;
    setMessages(prev => [...prev, {
      id: loadingId,
      text: "",
      sender: 'bot',
      timestamp: new Date(),
      isTyping: true,
      isError: false
    }]);

    try {
      // 3. Call API
      const botResponseText = await generateResponse(messages, userMsgText);

      // 4. Update Loading Message with Real Content
      setMessages(prev => prev.map(msg =>
        msg.id === loadingId
          ? { ...msg, text: botResponseText, isTyping: false }
          : msg
      ));
    } catch (error) {
      // Handle Error
      setMessages(prev => prev.map(msg =>
        msg.id === loadingId
          ? {
            ...msg,
            text: "I'm having trouble connecting right now. Please try again later.",
            isTyping: false,
            isError: true
          }
          : msg
      ));
    } finally {
      setIsLoading(false);
      // Keep focus on input for rapid chatting
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const clearChat = () => {
    setMessages([{
      id: Date.now(),
      text: "Chat cleared. What's on your mind?",
      sender: 'bot',
      timestamp: new Date(),
      isError: false
    }]);
    setIsSidebarOpen(false);
  };

  return (
    <div className={`flex h-screen w-full overflow-hidden transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-30 w-64 h-full flex flex-col
        border-r transition-transform duration-300 ease-in-out
        ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <Bot size={20} />
            </div>
            <span>AI Chatbot</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1 hover:bg-slate-800 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Sidebar Actions */}
        <div className="p-3">
          <button
            onClick={clearChat}
            className={`
              w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all
              ${darkMode
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-900/20'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
              }
            `}
          >
            <Plus size={18} />
            New Chat
          </button>
        </div>

        {/* History List (Mock) */}
        <div className="flex-1 overflow-y-auto py-2 px-3">
          <div className="text-xs font-semibold text-slate-500 mb-3 px-2 uppercase tracking-wider">Recent</div>
          {/* Mock history items just for visuals */}
          <div className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 cursor-pointer transition-colors ${darkMode ? 'bg-slate-900 text-slate-200' : 'bg-slate-100 text-slate-900'}`}>
            <MessageSquare size={16} className="text-slate-500" />
            <span className="text-sm truncate">Current Session</span>
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className={`p-4 border-t ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
              title="Toggle Theme"
            >
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button
              onClick={clearChat}
              className={`p-2 rounded-lg transition-colors text-red-500 ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-red-50'}`}
              title="Clear Conversation"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col h-full relative">

        {/* Header (Mobile only/Responsive) */}
        <header className={`
          flex items-center justify-between px-4 py-3 border-b md:hidden z-10
          ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}
        `}>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 rounded-lg active:bg-slate-800/20">
            <Menu size={24} />
          </button>
          <span className="font-semibold">Nexus AI</span>
          <div className="w-8" /> {/* Spacer */}
        </header>

        {/* Messages Feed */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth custom-scrollbar">
          <div className="max-w-3xl mx-auto space-y-4 pb-4">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </div>

        {/* Input Area */}
        <div className={`
          p-4 md:p-6 z-10
          ${darkMode ? 'bg-slate-900/95' : 'bg-white/95'}
        `}>
          <div className="max-w-3xl mx-auto relative">
            <form
              onSubmit={handleSend}
              className={`
                flex items-end gap-2 p-2 rounded-xl border shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all
                ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
              `}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message Nexus AI..."
                className={`
                  w-full bg-transparent border-none focus:ring-0 p-3 min-h-[50px] max-h-[150px] resize-none
                  ${darkMode ? 'text-white placeholder:text-slate-500' : 'text-slate-900 placeholder:text-slate-400'}
                `}
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className={`
                  p-3 rounded-lg flex-shrink-0 transition-all duration-200
                  ${!input.trim() || isLoading
                    ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md active:scale-95'
                  }
                `}
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
              </button>
            </form>
            <div className="text-center mt-2 text-xs text-slate-500">
              AI can make mistakes. Please check important information.
            </div>
          </div>
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: rgba(156, 163, 175, 0.5);
          border-radius: 20px;
        }
      `}</style>
    </div>
  );
}