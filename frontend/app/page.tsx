"use client";

import { useState, useEffect, useRef } from 'react';
import { Loader2, MessageSquare, ChevronRight, Activity, Send, X, Search } from 'lucide-react';

interface Article {
  title: string;
  description: string;
  content: string;
  url: string;
  publishedAt: string;
}

export default function App() {
  const [role, setRole] = useState<string | null>(null);
  const [news, setNews] = useState<Article[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [country, setCountry] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeSearch, setActiveSearch] = useState<string>("");
  
  const [activeStory, setActiveStory] = useState<Article | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [useVernacular, setUseVernacular] = useState(false);
  
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user'|'ai', content: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (role) {
      fetchNews(role, country, activeSearch);
    }
  }, [role, country, activeSearch]);

  const fetchNews = async (selectedRole: string, selectedCountry: string, search: string) => {
    setLoadingNews(true);
    try {
      let url = `http://localhost:8000/news?role=${selectedRole}`;
      if (selectedCountry !== "all") url += `&country=${selectedCountry}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      
      const res = await fetch(url);
      const data = await res.json();
      if (data.articles) setNews(data.articles);
    } catch (e) {
      console.error(e);
    }
    setLoadingNews(false);
  };

  const handleSummarize = async (article: Article) => {
    setActiveStory(article);
    setSummary(null);
    setLoadingSummary(true);
    try {
      const res = await fetch(`http://localhost:8000/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: article.url, title: article.title, description: article.description || "", vernacular: useVernacular })
      });
      const data = await res.json();
      setSummary(data.summary);
    } catch (e) {
      console.error(e);
      setSummary("Failed to generate summary.");
    }
    setLoadingSummary(false);
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput;
    // Add user message, and an empty AI message placeholder to be filled via stream
    setChatMessages(prev => [...prev, { role: 'user', content: msg }, { role: 'ai', content: "" }]);
    setChatInput("");
    setLoadingChat(true);

    try {
      // Exclude the placeholder AI message we just added
      const historyPayload = chatMessages.slice(-4).map(m => ({ role: m.role, content: m.content }));
      
      // Inject context stealthily so the AI and RAG search know what we're looking at
      const apiQuery = activeStory 
        ? `[Context: I am currently reading the article: "${activeStory.title}"]. ${msg}` 
        : msg;
      
      const res = await fetch(`http://localhost:8000/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: apiQuery, history: historyPayload })
      });
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No readable stream");

      setLoadingChat(false); // Hide the loader as soon as we connect and start getting stream
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        // Append chunk to the last AI message
        setChatMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = newMessages[newMessages.length - 1];
          if (lastMsg.role === 'ai') {
             lastMsg.content += chunk;
          }
          return newMessages;
        });
      }
    } catch (e) {
      console.error(e);
      setLoadingChat(false);
      setChatMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg.role === 'ai' && !lastMsg.content) {
            lastMsg.content = "Failed to connect to local AI Copilot.";
        }
        return newMessages;
      });
    }
  };

  if (!role) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-950 to-gray-950 p-6 relative overflow-hidden">
        {/* Abstract Background Effects */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/10 blur-[120px] rounded-full pointer-events-none"></div>
        
        <h1 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400 mb-6 flex items-center gap-4 z-10 drop-shadow-lg">
            <Activity className="w-12 h-12 text-emerald-400 drop-shadow-lg" />
            ET IntelliSphere
        </h1>
        <p className="text-gray-300 mb-12 max-w-lg text-center text-lg z-10 leading-relaxed font-light">Select your perspective to unlock a highly personalized business intelligence feed driven by local AI.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl z-10">
          {['Investor', 'Student', 'Founder'].map(r => (
            <button 
                key={r} 
                onClick={() => setRole(r)}
                className="group relative p-8 rounded-3xl bg-gray-900/40 border border-gray-800 backdrop-blur-md hover:border-blue-500/50 hover:shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)] hover:-translate-y-1 transition-all duration-300 text-left overflow-hidden"
            >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <h3 className="text-3xl font-bold text-white mb-3 tracking-tight">{r}</h3>
                <p className="text-sm text-gray-400 font-light leading-relaxed">Tailored insights, risk assessment, and market correlation analysis curated for {r.toLowerCase()}s.</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col md:flex-row text-gray-200">
      {/* Sidebar News Feed */}
      <div className="w-full md:w-[35%] lg:w-[30%] border-r border-gray-800/60 h-screen overflow-y-auto p-5 custom-scrollbar bg-gray-950/50">
        <div className="mb-6 backdrop-blur-md sticky top-0 pt-2 pb-4 z-10 bg-gray-950/90 rounded-b-xl border-b border-gray-800/50">
            <div className="flex justify-between items-center mb-4 px-2">
                <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2"><Activity className="w-6 h-6 text-blue-500"/> Feed</h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full">{role}</span>
                  <button className="text-xs text-gray-500 hover:text-white transition-colors" onClick={() => setRole(null)}>Reset</button>
                </div>
            </div>
            
            {/* Filter & Search Bar */}
            <div className="flex flex-col gap-3 px-2">
                <div className="relative group">
                    <input 
                        type="text" 
                        placeholder="Search topics..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && setActiveSearch(searchQuery)}
                        className="w-full bg-gray-900 border border-gray-800 rounded-xl py-2.5 pl-4 pr-10 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 focus:bg-gray-800/50 transition-all font-light"
                    />
                    <button 
                        onClick={() => setActiveSearch(searchQuery)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-blue-400 transition-colors"
                    >
                        <Search className="w-4 h-4" />
                    </button>
                </div>
                <select 
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl py-2.5 px-3 text-sm text-gray-200 focus:outline-none focus:border-blue-500/50 transition-all appearance-none cursor-pointer font-light bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M6%209L12%2015L18%209%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-[right_12px_center] bg-no-repeat"
                >
                    <option value="all">🌍 Global News</option>
                    <option value="in">🇮🇳 India</option>
                    <option value="us">🇺🇸 United States</option>
                    <option value="gb">🇬🇧 United Kingdom</option>
                    <option value="au">🇦🇺 Australia</option>
                </select>
            </div>
        </div>

        {loadingNews ? (
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse flex flex-col gap-3 p-5 bg-gray-900/60 rounded-2xl border border-gray-800/50">
                <div className="h-5 bg-gray-800 rounded w-4/5"></div>
                <div className="h-3 bg-gray-800 rounded w-full"></div>
                <div className="h-3 bg-gray-800 rounded w-11/12"></div>
                <div className="h-3 bg-gray-800 rounded w-1/4 mt-2"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {news.map((item, idx) => (
              <div 
                key={idx} 
                onClick={() => handleSummarize(item)}
                className={`p-5 rounded-2xl cursor-pointer transition-all duration-300 border ${activeStory?.url === item.url ? 'border-emerald-500/50 bg-gray-800/80 shadow-[0_0_20px_-5px_rgba(16,185,129,0.15)]' : 'border-gray-800/40 bg-gray-900/40 hover:bg-gray-800 hover:border-gray-700'}`}
              >
                <h3 className="font-semibold text-gray-100 mb-2 leading-snug line-clamp-2">{item.title}</h3>
                <p className="text-xs text-gray-400 leading-relaxed font-light line-clamp-3">{item.description}</p>
                <div className="mt-4 text-[11px] text-gray-500 flex justify-between items-center font-medium">
                    <span>{new Date(item.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})}</span>
                    <span className="text-emerald-400/90 flex items-center group-hover:text-emerald-300">Intelli-Brief <ChevronRight className="w-3 h-3 ml-0.5 opacity-70"/></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="w-full md:w-[65%] lg:w-[70%] h-screen overflow-y-auto p-10 relative bg-gray-950">
        <div className="absolute top-0 right-0 w-full h-1/2 bg-gradient-to-b from-blue-900/5 to-transparent pointer-events-none"></div>
        {activeStory ? (
            <div className="max-w-4xl mx-auto pb-32 animate-in fade-in duration-500 z-10 relative">
                <div className="mb-8">
                  <h1 className="text-4xl font-extrabold text-white mb-4 leading-tight tracking-tight">{activeStory.title}</h1>
                  <a href={activeStory.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-blue-400/80 hover:text-blue-300 transition-colors inline-block mb-2">Read source article ↗</a>
                </div>
                
                <div className="bg-gray-900/60 border border-gray-800 p-8 rounded-3xl shadow-xl shadow-black/40 backdrop-blur-xl relative">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-semibold text-white flex items-center gap-3">
                            <span className="bg-gradient-to-br from-emerald-500 to-emerald-700 text-white p-2 rounded-xl shadow-inner shadow-emerald-400/20"><Activity className="w-4 h-4" /></span>
                            AI Intelligence Brief
                        </h2>
                        <button onClick={() => setUseVernacular(!useVernacular)} className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${useVernacular ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}>
                            {useVernacular ? 'Hinglish Mode ON' : 'Hinglish Mode OFF'}
                        </button>
                    </div>
                    
                    {loadingSummary ? (
                        <div className="space-y-4 pt-2">
                            <div className="h-4 bg-gray-800/80 rounded block animate-pulse" style={{width: '95%', animationDelay: '0ms'}}></div>
                            <div className="h-4 bg-gray-800/80 rounded block animate-pulse" style={{width: '100%', animationDelay: '100ms'}}></div>
                            <div className="h-4 bg-gray-800/80 rounded block animate-pulse" style={{width: '85%', animationDelay: '200ms'}}></div>
                            <div className="h-4 bg-gray-800/80 rounded block animate-pulse mt-6" style={{width: '40%', animationDelay: '300ms'}}></div>
                            <div className="h-4 bg-gray-800/80 rounded block animate-pulse" style={{width: '75%', animationDelay: '400ms'}}></div>
                        </div>
                    ) : summary && typeof summary === 'object' && !summary.error && summary.summary ? (
                        <div className="space-y-6 animate-in fade-in duration-500">
                            <div>
                                <h3 className="text-emerald-400 font-semibold mb-2 uppercase text-xs tracking-wider border-b border-gray-800 pb-1">AI Executive Summary</h3>
                                <p className="text-gray-200 font-light leading-relaxed">{summary.summary}</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-900/50 p-4 rounded-xl border border-gray-800/50">
                                <div>
                                    <h3 className="text-blue-400 font-semibold mb-1 uppercase text-xs tracking-wider">Why It Matters</h3>
                                    <p className="text-gray-300 font-light text-sm">{summary.why_it_matters || 'N/A'}</p>
                                </div>
                                <div>
                                    <h3 className="text-purple-400 font-semibold mb-1 uppercase text-xs tracking-wider">Market Impact</h3>
                                    <p className="text-gray-300 font-light text-sm">{summary.market_impact || 'N/A'}</p>
                                </div>
                                <div className="mt-2 md:mt-0">
                                    <h3 className="text-red-400 font-semibold mb-1 uppercase text-xs tracking-wider">Risks</h3>
                                    <p className="text-gray-300 font-light text-sm">{summary.risks || 'N/A'}</p>
                                </div>
                                <div className="mt-2 md:mt-0">
                                    <h3 className="text-yellow-400 font-semibold mb-1 uppercase text-xs tracking-wider">Future Prediction</h3>
                                    <p className="text-gray-300 font-light text-sm">{summary.future_prediction || 'N/A'}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="prose prose-invert prose-emerald max-w-none text-gray-300 font-light leading-relaxed whitespace-pre-wrap CustomMarkdownStyle">
                            {summary?.error ? <div className="text-red-400 mb-2 border border-red-900/50 bg-red-900/10 p-3 rounded">{summary.error}</div> : null}
                            {summary?.summary || String(summary)}
                        </div>
                    )}
                </div>
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-center opacity-40 z-10 relative hover:opacity-60 transition-opacity">
                <div className="p-6 rounded-full bg-gray-800/30 border border-gray-700/50 mb-6">
                  <Activity className="w-12 h-12 text-gray-500" />
                </div>
                <h2 className="text-2xl font-semibold text-gray-300">Select an article for AI Briefing</h2>
                <p className="text-sm text-gray-500 mt-3 max-w-sm font-light">Leveraging local precision AI to extract complex market indicators, impact analysis, and customized takeaways.</p>
            </div>
        )}
      </div>

      {/* Chat Copilot Floating Button */}
      {!isChatOpen && (
          <button 
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-8 right-8 z-50 bg-gradient-to-tr from-blue-600 to-emerald-500 hover:from-blue-500 hover:to-emerald-400 text-white p-4 rounded-full shadow-[0_0_30px_-5px_var(--tw-shadow-color)] shadow-blue-500/40 hover:scale-110 transition-all duration-300"
          >
            <MessageSquare className="w-6 h-6" />
          </button>
      )}

      {/* Chat Copilot Panel */}
      {isChatOpen && (
          <div className="fixed bottom-8 right-8 w-[420px] h-[650px] bg-gray-900 border border-gray-700/80 rounded-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300 z-50">
              <div className="p-5 bg-gray-800/90 backdrop-blur-md border-b border-gray-700/60 flex justify-between items-center shadow-sm">
                  <h3 className="font-semibold text-white flex items-center gap-2"><MessageSquare className="w-4 h-4 text-emerald-400"/> Context Co-Pilot</h3>
                  <button onClick={() => setIsChatOpen(false)} className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-gray-700/50 transition-colors">
                      <X className="w-5 h-5"/>
                  </button>
              </div>
              
              <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-5 custom-scrollbar bg-gradient-to-b from-gray-900 to-gray-950">
                  {chatMessages.length === 0 && (
                      <div className="text-center text-gray-500 my-auto text-sm font-light px-8">
                          Chat directly with the AI about any story in your feed. Context is automatically managed using local RAG.
                      </div>
                  )}
                  {chatMessages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm font-light leading-relaxed shadow-sm ${m.role === 'user' ? 'bg-blue-600/90 border border-blue-500/50 text-white rounded-tr-md' : 'bg-gray-800 border border-gray-700/50 text-gray-200 rounded-tl-md'}`}>
                              {m.content}
                          </div>
                      </div>
                  ))}
                  {loadingChat && (
                      <div className="flex justify-start">
                          <div className="bg-gray-800 border border-gray-700/50 p-3.5 rounded-2xl rounded-tl-md text-gray-400 flex items-center gap-3 text-sm shadow-sm font-light">
                              <Loader2 className="w-4 h-4 animate-spin text-emerald-500"/> Reading context...
                          </div>
                      </div>
                  )}
                  <div ref={chatEndRef} />
              </div>

              <div className="p-4 bg-gray-800/90 backdrop-blur-md border-t border-gray-700/60">
                  <div className="relative group/input">
                      <input 
                          type="text" 
                          placeholder="Ask about implications or risks..." 
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleChat()}
                          className="w-full bg-gray-950/50 border border-gray-700/80 rounded-full py-3.5 px-5 pr-12 text-sm text-gray-200 font-light focus:outline-none focus:border-emerald-500/50 focus:bg-gray-900 transition-all shadow-inner"
                      />
                      <button 
                          onClick={handleChat}
                          disabled={!chatInput.trim() || loadingChat}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-emerald-600 rounded-full text-white disabled:opacity-50 disabled:bg-gray-700 hover:bg-emerald-500 active:scale-95 transition-all shadow-sm group-focus-within/input:shadow-[0_0_15px_-3px_var(--tw-shadow-color)] group-focus-within/input:shadow-emerald-500/40"
                      >
                          <Send className="w-4 h-4 ml-0.5" />
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
