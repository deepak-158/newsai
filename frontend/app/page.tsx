"use client";

import { useState, useEffect, useRef } from 'react';
import { Loader2, MessageSquare, ChevronRight, Activity, Send, X, Search, Zap, Clock, AlertTriangle, Target, Eye, Settings, Sun, Moon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Article {
  title: string;
  description: string;
  content: string;
  url: string;
  publishedAt: string;
}

type MainTab = 'summary' | 'navigator' | 'storyarc';

const API_BASE = "http://localhost:8000";

const QUICK_ACTIONS = [
  { label: "Explain simply", icon: "💡", prompt: "Explain this article in simple terms using an analogy." },
  { label: "Risks breakdown", icon: "⚠️", prompt: "Break down all the risks from this article with probability assessment." },
  { label: "Contrarian view", icon: "🔄", prompt: "Give me a contrarian perspective that challenges the mainstream narrative of this article." },
  { label: "What happens next", icon: "🔮", prompt: "What are the most likely next developments from this story?" },
  { label: "Impact on me", icon: "🎯", prompt: "How does this news specifically impact someone in my role?" },
];

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

  const [activeTab, setActiveTab] = useState<MainTab>('summary');
  
  const [navigatorBrief, setNavigatorBrief] = useState<any>(null);
  const [navigatorArticles, setNavigatorArticles] = useState<string[]>([]);
  const [loadingNavigator, setLoadingNavigator] = useState(false);

  const [storyArc, setStoryArc] = useState<any>(null);
  const [loadingStoryArc, setLoadingStoryArc] = useState(false);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [videoModelUsed, setVideoModelUsed] = useState<string>('');

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  // Model tracking
  const [modelUsed, setModelUsed] = useState<string>('');
  const [chatModel, setChatModel] = useState<string>('');

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: 'user'|'ai', content: string}[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [geminiKeyStatus, setGeminiKeyStatus] = useState<{is_set: boolean, masked_key: string}>({is_set: false, masked_key: ""});
  const [savingKey, setSavingKey] = useState(false);

  // Groq key
  const [groqKeyInput, setGroqKeyInput] = useState("");
  const [groqKeyStatus, setGroqKeyStatus] = useState<{is_set: boolean, masked_key: string}>({is_set: false, masked_key: ""});
  const [savingGroqKey, setSavingGroqKey] = useState(false);

  // OpenRouter key
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState("");
  const [openrouterKeyStatus, setOpenrouterKeyStatus] = useState<{is_set: boolean, masked_key: string}>({is_set: false, masked_key: ""});
  const [savingOpenrouterKey, setSavingOpenrouterKey] = useState(false);

  // D-ID key
  const [didKeyInput, setDidKeyInput] = useState("");
  const [didKeyStatus, setDidKeyStatus] = useState<{is_set: boolean, masked_key: string}>({is_set: false, masked_key: ""});
  const [savingDidKey, setSavingDidKey] = useState(false);


  // Theme state
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('et-theme');
    if (saved === 'light') {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('et-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('et-theme', 'light');
    }
  };

  const fetchGeminiKeyStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/gemini-key`);
      const data = await res.json();
      setGeminiKeyStatus(data);
    } catch (e) {
      console.error("Failed to fetch API key status", e);
    }
  };

  const fetchGroqKeyStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/groq-key`);
      const data = await res.json();
      setGroqKeyStatus(data);
    } catch (e) {
      console.error("Failed to fetch Groq key status", e);
    }
  };

  const fetchOpenRouterKeyStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/openrouter-key`);
      const data = await res.json();
      setOpenrouterKeyStatus(data);
    } catch (e) {
      console.error("Failed to fetch OpenRouter key status", e);
    }
  };

  const fetchDidKeyStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/did-key`);
      const data = await res.json();
      setDidKeyStatus(data);
    } catch (e) {
      console.error("Failed to fetch D-ID key status", e);
    }
  };

  useEffect(() => {
    fetchGeminiKeyStatus();
    fetchGroqKeyStatus();
    fetchOpenRouterKeyStatus();
    fetchDidKeyStatus();
  }, []);

  useEffect(() => {
    if (role) {
      fetchNews(role, country, activeSearch);
    }
  }, [role, country, activeSearch]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchNews = async (selectedRole: string, selectedCountry: string, search: string) => {
    setLoadingNews(true);
    try {
      let url = `${API_BASE}/news?role=${selectedRole}`;
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
    setNavigatorBrief(null);
    setStoryArc(null);
    setVideoUrl(null);
    setVideoModelUsed('');
    setAudioUrl(null);
    setActiveTab('summary');
    setLoadingSummary(true);
    setModelUsed('');
    try {
      const res = await fetch(`${API_BASE}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: article.url, title: article.title, 
          description: article.description || "", 
          vernacular: useVernacular,
          role: role || ""
        })
      });
      const data = await res.json();
      setSummary(data.summary);
      if (data.model_used) setModelUsed(data.model_used);
      if (data.cached) setModelUsed('Cache');
    } catch (e) {
      console.error(e);
      setSummary("Failed to generate summary.");
    }
    setLoadingSummary(false);
  };

  const handleNavigator = async () => {
    if (!activeStory) return;
    setActiveTab('navigator');
    setNavigatorBrief(null);
    setLoadingNavigator(true);
    setModelUsed('');
    try {
      const res = await fetch(`${API_BASE}/navigator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: activeStory.title, description: activeStory.description || "" })
      });
      const data = await res.json();
      setNavigatorBrief(data.brief);
      setNavigatorArticles(data.article_titles || []);
      if (data.model_used) setModelUsed(data.model_used);
      if (data.cached) setModelUsed('Cache');
    } catch (e) {
      console.error(e);
      setNavigatorBrief({ unified_summary: "Failed to generate navigator briefing." });
    }
    setLoadingNavigator(false);
  };

  const handleStoryArc = async () => {
    if (!activeStory) return;
    setActiveTab('storyarc');
    setStoryArc(null);
    setLoadingStoryArc(true);
    setModelUsed('');
    try {
      const res = await fetch(`${API_BASE}/story-arc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          topic: activeStory.title,
          articles: [{ url: activeStory.url, title: activeStory.title, 
                       description: activeStory.description, publishedAt: activeStory.publishedAt }]
        })
      });
      const data = await res.json();
      setStoryArc(data.arc);
      if (data.model_used) setModelUsed(data.model_used);
      if (data.cached) setModelUsed('Cache');
    } catch (e) {
      console.error(e);
      setStoryArc({ timeline: [], trend_analysis: "Failed to generate story arc." });
    }
    setLoadingStoryArc(false);
  };

  const handleGenerateVideo = async () => {
    if (!activeStory) return;
    setLoadingVideo(true);
    setVideoModelUsed('');
    try {
      const res = await fetch(`${API_BASE}/generate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          article_id: activeStory.url, 
          text: activeStory.content || activeStory.description || activeStory.title 
        })
      });
      const data = await res.json();
      if (res.ok && data.video_url) {
        setVideoUrl(data.video_url);
        if (data.model_used) setVideoModelUsed(data.model_used);
        if (data.cached) setVideoModelUsed('Cache');
      } else {
        console.error("Video generation failed", data);
        alert("Failed to generate AI video. See console for details.");
      }
    } catch (e) {
      console.error(e);
      alert("Error calling video generation service.");
    }
    setLoadingVideo(false);
  };

  const handleGenerateAudio = async () => {
    if (!activeStory) return;
    setLoadingAudio(true);
    try {
      const res = await fetch(`${API_BASE}/generate-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          article_id: activeStory.url, 
          text: activeStory.content || activeStory.description || activeStory.title 
        })
      });
      const data = await res.json();
      if (res.ok && data.audio_url) {
        setAudioUrl(`${API_BASE}${data.audio_url}`);
      } else {
        console.error("Audio generation failed", data);
        alert("Failed to generate AI Audio. Ensure Piper TTS is installed.");
      }
    } catch (e) {
      console.error(e);
      alert("Error calling audio generation service.");
    }
    setLoadingAudio(false);
  };

  const handleChat = async (overrideMsg?: string) => {
    const msg = overrideMsg || chatInput;
    if (!msg.trim()) return;
    
    setChatMessages(prev => [...prev, { role: 'user', content: msg }, { role: 'ai', content: "" }]);
    setChatInput("");
    setLoadingChat(true);
    setChatModel('');

    try {
      const historyPayload = chatMessages.slice(-4).map(m => ({ role: m.role, content: m.content }));
      
      const articleCtx = activeStory 
        ? `${activeStory.title}. ${activeStory.description || ""}` 
        : "";

      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: msg, 
          history: historyPayload,
          article_context: articleCtx,
          user_role: role || ""
        })
      });
      
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No readable stream");

      setLoadingChat(false);
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        let chunk = decoder.decode(value, { stream: true });
        
        // Parse model indicator token from stream
        const modelMatch = chunk.match(/__MODEL:(\w+)__/);
        if (modelMatch) {
          setChatModel(modelMatch[1]);
          chunk = chunk.replace(/__MODEL:\w+__/, '');
        }
        
        if (!chunk) continue;
        
        setChatMessages(prev => {
          const newMessages = [...prev];
          const lastMsg = { ...newMessages[newMessages.length - 1] };
          if (lastMsg.role === 'ai') {
             lastMsg.content += chunk;
          }
          newMessages[newMessages.length - 1] = lastMsg;
          return newMessages;
        });
      }
    } catch (e) {
      console.error(e);
      setLoadingChat(false);
      setChatMessages(prev => {
        const newMessages = [...prev];
        const lastMsg = { ...newMessages[newMessages.length - 1] };
        if (lastMsg.role === 'ai' && !lastMsg.content) {
            lastMsg.content = "Failed to connect to AI Co-Pilot.";
        }
        newMessages[newMessages.length - 1] = lastMsg;
        return newMessages;
      });
    }
  };

  const handleQuickAction = (prompt: string) => {
    handleChat(prompt);
  };

  const handleSaveGeminiKey = async () => {
    if (!geminiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      await fetch(`${API_BASE}/api/settings/gemini-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: geminiKeyInput.trim() })
      });
      await fetchGeminiKeyStatus();
      setGeminiKeyInput("");
    } catch (e) {
      console.error("Failed to save API key", e);
    }
    setSavingKey(false);
  };

  const handleSaveGroqKey = async () => {
    if (!groqKeyInput.trim()) return;
    setSavingGroqKey(true);
    try {
      await fetch(`${API_BASE}/api/settings/groq-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: groqKeyInput.trim() })
      });
      await fetchGroqKeyStatus();
      setGroqKeyInput("");
    } catch (e) {
      console.error("Failed to save Groq key", e);
    }
    setSavingGroqKey(false);
  };

  const handleSaveOpenRouterKey = async () => {
    if (!openrouterKeyInput.trim()) return;
    setSavingOpenrouterKey(true);
    try {
      await fetch(`${API_BASE}/api/settings/openrouter-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: openrouterKeyInput.trim() })
      });
      await fetchOpenRouterKeyStatus();
      setOpenrouterKeyInput("");
    } catch (e) {
      console.error("Failed to save OpenRouter key", e);
    }
    setSavingOpenrouterKey(false);
  };

  const handleSaveDidKey = async () => {
    if (!didKeyInput.trim()) return;
    setSavingDidKey(true);
    try {
      await fetch(`${API_BASE}/api/settings/did-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: didKeyInput.trim() })
      });
      await fetchDidKeyStatus();
      setDidKeyInput("");
    } catch (e) {
      console.error("Failed to save D-ID key", e);
    }
    setSavingDidKey(false);
  };

  const handleSaveAllSettings = async () => {
    if (geminiKeyInput.trim()) await handleSaveGeminiKey();
    if (groqKeyInput.trim()) await handleSaveGroqKey();
    if (openrouterKeyInput.trim()) await handleSaveOpenRouterKey();
    if (didKeyInput.trim()) await handleSaveDidKey();
    setIsSettingsOpen(false);
  };

  // ── Role Selection Screen ────────────────────────────────────
  if (!role) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        {/* Theme toggle on role screen */}
        <div className="absolute top-6 right-6 z-20">
          <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle theme">
            <div className={`theme-toggle-knob ${isDark ? 'dark-active' : ''}`}>
              {isDark ? '🌙' : '☀️'}
            </div>
          </button>
        </div>

        <div className="animate-float mb-3">
          <div className="icon-badge" style={{ padding: '1rem', borderRadius: '20px' }}>
            <Activity className="w-10 h-10" />
          </div>
        </div>
        <h1 className="text-5xl font-extrabold mb-4 tracking-tight z-10" style={{ color: 'var(--accent-primary)' }}>
            ET IntelliSphere
        </h1>
        <p className="mb-12 max-w-lg text-center text-lg z-10 leading-relaxed font-light" style={{ color: 'var(--text-muted)' }}>
          AI-native news intelligence platform. Select your perspective to unlock personalized briefings, multi-article analysis, and story tracking.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-4xl z-10">
          {[
            { name: 'Investor', emoji: '📈', desc: 'Market signals, risk assessment, and portfolio-relevant intel.' },
            { name: 'Student', emoji: '🎓', desc: 'Knowledge synthesis, learning insights, and academic relevance.' },
            { name: 'Founder', emoji: '🚀', desc: 'Competitive landscape, opportunity signals, and strategic intel.' }
          ].map(r => (
            <button 
                key={r.name} 
                onClick={() => setRole(r.name)}
                className="role-card group text-left"
            >
                <span className="text-4xl mb-4 block">{r.emoji}</span>
                <h3 className="text-2xl font-bold mb-2 tracking-tight" style={{ color: 'var(--text-primary)' }}>{r.name}</h3>
                <p className="text-sm font-light leading-relaxed" style={{ color: 'var(--text-muted)' }}>{r.desc}</p>
                <div className="mt-4 flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--accent-primary)' }}>
                  Enter <ChevronRight className="w-3 h-3" />
                </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Decision Signal Badge Component ──────────────────────────
  const DecisionSignal = ({ signal }: { signal: any }) => {
    if (!signal) return null;
    const verdict = signal.verdict || "Neutral";
    const confidence = signal.confidence || "Low";
    const cls = verdict === "Positive" ? "signal-positive" 
              : verdict === "Negative" ? "signal-negative" 
              : "signal-neutral";
    const confCls = confidence === "High" ? "confidence-high" 
                  : confidence === "Medium" ? "confidence-medium" 
                  : "confidence-low";
    return (
      <div className={`signal-badge ${cls}`}>
        <span className={`confidence-dot ${confCls}`}></span>
        <span>{verdict}</span>
        <span className="text-xs" style={{ opacity: 0.6 }}>({confidence} confidence)</span>
      </div>
    );
  };

  // ── Loading Skeleton ─────────────────────────────────────────
  const LoadingSkeleton = () => (
    <div className="space-y-4 pt-2">
      {[95, 100, 85, 40, 75, 60].map((w, i) => (
        <div key={i} className="h-4 loading-shimmer" style={{width: `${w}%`, animationDelay: `${i*150}ms`}}></div>
      ))}
    </div>
  );

  // ── Model Badge Component ───────────────────────────────────
  const ModelBadge = ({ model }: { model: string }) => {
    if (!model) return null;
    const config: Record<string, { emoji: string; color: string; bg: string }> = {
      'Gemini': { emoji: '✦', color: '#4285f4', bg: 'rgba(66, 133, 244, 0.12)' },
      'Groq': { emoji: '⚡', color: '#F5402C', bg: 'rgba(245, 64, 44, 0.12)' },
      'OpenRouter': { emoji: '🌍', color: '#6a0dad', bg: 'rgba(106, 13, 173, 0.12)' },
      'Ollama': { emoji: '🦙', color: '#43e97b', bg: 'rgba(67, 233, 123, 0.12)' },
      'Cache': { emoji: '📥', color: 'var(--accent-warning)', bg: 'rgba(246, 173, 85, 0.12)' },
    };
    const c = config[model] || { emoji: '🤖', color: 'var(--text-muted)', bg: 'rgba(160,174,192,0.12)' };
    return (
      <span 
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-wide uppercase transition-all animate-fade-in"
        style={{ color: c.color, background: c.bg, border: `1px solid ${c.color}25` }}
        title={`Powered by ${model}`}
      >
        <span>{c.emoji}</span>{model}
      </span>
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* ── Sidebar News Feed ───────────────────────────────────── */}
      <div className="w-full md:w-[35%] lg:w-[30%] h-screen overflow-y-auto p-5 custom-scrollbar" style={{ background: 'var(--bg-sidebar)' }}>
        <div className="mb-6 sticky top-0 pt-2 pb-4 z-10" style={{ background: 'var(--bg-sidebar)' }}>
            <div className="flex justify-between items-center mb-5 px-1">
                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <div className="icon-badge" style={{ padding: '0.35rem', borderRadius: '10px' }}>
                    <Activity className="w-4 h-4" />
                  </div>
                  Feed
                </h2>
                <div className="flex items-center gap-3">
                  {/* Theme Toggle */}
                  <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle theme">
                    <div className={`theme-toggle-knob ${isDark ? 'dark-active' : ''}`}>
                      {isDark ? '🌙' : '☀️'}
                    </div>
                  </button>
                  <span className="text-xs font-semibold px-3 py-1 neu-subtle" style={{ color: 'var(--accent-primary)' }}>{role}</span>
                  <button className="neu-btn text-xs" style={{ padding: '0.25rem 0.6rem', color: 'var(--text-muted)', fontSize: '0.7rem' }} onClick={() => setRole(null)}>Reset</button>
                  <button onClick={() => setIsSettingsOpen(true)} className="neu-btn" style={{ padding: '0.35rem', borderRadius: '10px' }} title="Settings">
                    <Settings className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                  </button>
                </div>
            </div>
            
            <div className="flex flex-col gap-3 px-1">
                <div className="relative">
                    <input 
                        type="text" 
                        placeholder="Search topics..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && setActiveSearch(searchQuery)}
                        className="w-full neu-input pr-10"
                    />
                    <button 
                        onClick={() => setActiveSearch(searchQuery)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                        style={{ color: 'var(--text-faint)' }}
                    >
                        <Search className="w-4 h-4" />
                    </button>
                </div>
                <select 
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full neu-input cursor-pointer appearance-none"
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
              <div key={i} className="flex flex-col gap-3 p-5 neu-soft" style={{ animationDelay: `${i*100}ms` }}>
                <div className="h-5 loading-shimmer" style={{ width: '80%' }}></div>
                <div className="h-3 loading-shimmer" style={{ width: '100%' }}></div>
                <div className="h-3 loading-shimmer" style={{ width: '92%' }}></div>
                <div className="h-3 loading-shimmer" style={{ width: '25%', marginTop: '0.5rem' }}></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {news.map((item, idx) => (
              <div 
                key={idx} 
                onClick={() => handleSummarize(item)}
                className={`news-card ${activeStory?.url === item.url ? 'active' : ''}`}
              >
                <h3 className="font-semibold mb-2 leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }}>{item.title}</h3>
                <p className="text-xs leading-relaxed font-light line-clamp-3" style={{ color: 'var(--text-muted)' }}>{item.description}</p>
                <div className="mt-4 text-[11px] flex justify-between items-center font-medium" style={{ color: 'var(--text-faint)' }}>
                    <span>{new Date(item.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric'})}</span>
                    <span className="flex items-center" style={{ color: 'var(--accent-primary)' }}>Intelli-Brief <ChevronRight className="w-3 h-3 ml-0.5 opacity-70"/></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Main Content Area ───────────────────────────────────── */}
      <div className="w-full md:w-[65%] lg:w-[70%] h-screen overflow-y-auto p-10 relative custom-scrollbar" style={{ background: 'var(--bg-primary)' }}>
        {activeStory ? (
            <div className="max-w-4xl mx-auto pb-32 animate-fade-slide-up z-10 relative">
                {/* Article Header */}
                <div className="mb-6">
                  <h1 className="text-4xl font-extrabold mb-4 leading-tight tracking-tight" style={{ color: 'var(--text-primary)' }}>{activeStory.title}</h1>
                  <a href={activeStory.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:opacity-80 transition-opacity inline-block mb-2" style={{ color: 'var(--accent-primary)' }}>Read source article ↗</a>
                </div>
                
                {/* Tab Navigation */}
                <div className="flex items-center gap-3 mb-8 flex-wrap">
                  <button onClick={() => setActiveTab('summary')} className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}>
                    <Activity className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5"/>AI Brief
                  </button>
                  <button onClick={handleNavigator} className={`tab-btn ${activeTab === 'navigator' ? 'active' : ''}`}>
                    <Zap className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5"/>🧠 Navigator
                  </button>
                  <button onClick={handleStoryArc} className={`tab-btn ${activeTab === 'storyarc' ? 'active' : ''}`}>
                    <Clock className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5"/>📈 Story Arc
                  </button>
                  <div className="ml-auto flex items-center gap-4">
                    <button 
                      onClick={handleGenerateAudio} 
                      disabled={loadingAudio}
                      className="tab-btn font-semibold shadow-sm transition-all" 
                      style={{ 
                        background: loadingAudio ? 'var(--neu-bg)' : 'var(--accent-secondary)', 
                        color: loadingAudio ? 'var(--text-muted)' : '#fff', 
                        border: 'none',
                        padding: '0.4rem 1rem'
                      }}
                    >
                      {loadingAudio ? <Loader2 className="w-3.5 h-3.5 inline mr-1.5 animate-spin"/> : "🎧 "}
                      Listen
                    </button>
                    <button 
                      onClick={handleGenerateVideo} 
                      disabled={loadingVideo}
                      className="tab-btn font-semibold shadow-sm transition-all" 
                      style={{ 
                        background: loadingVideo ? 'var(--neu-bg)' : 'var(--accent-primary)', 
                        color: loadingVideo ? 'var(--text-muted)' : '#fff', 
                        border: 'none',
                        padding: '0.4rem 1rem'
                      }}
                    >
                      {loadingVideo ? <Loader2 className="w-3.5 h-3.5 inline mr-1.5 animate-spin"/> : "🎥 "}
                      Generate AI Video
                    </button>
                    <div className="border-l pl-4 border-[var(--border-subtle)]">
                      <ModelBadge model={modelUsed} />
                    </div>
                  </div>
                </div>

                {/* ── AI Avatar Video Player ────────────────────────────── */}
                {(loadingVideo || videoUrl) && (
                  <div className="content-panel mb-8 animate-fade-slide-up bg-opacity-50">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
                            <span className="icon-badge"><Eye className="w-4 h-4" /></span>
                            AI Anchor Video
                        </h2>
                        {videoModelUsed && <ModelBadge model={videoModelUsed} />}
                    </div>
                    {loadingVideo ? (
                      <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl" style={{ borderColor: 'var(--border-subtle)' }}>
                        <Loader2 className="w-8 h-8 animate-spin mb-4" style={{ color: 'var(--accent-primary)' }}/>
                        <p className="font-medium animate-pulse text-sm" style={{ color: 'var(--text-secondary)' }}>
                           Generating AI avatar video... (this may take 30-60 seconds)
                        </p>
                      </div>
                    ) : (
                      videoUrl && (
                        <div className="w-full flex justify-center rounded-xl overflow-hidden bg-black relative" style={{ minHeight: '300px' }}>
                          <video 
                            controls 
                            className="w-full h-auto object-contain max-h-[500px]"
                            src={videoUrl}
                          />
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* ── AI Audio Player ────────────────────────────── */}
                {(loadingAudio || audioUrl) && (
                  <div className="content-panel mb-8 animate-fade-slide-up bg-opacity-50">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
                            <span className="icon-badge">🎧</span>
                            AI Audio Brief
                        </h2>
                    </div>
                    {loadingAudio ? (
                      <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl" style={{ borderColor: 'var(--border-subtle)' }}>
                        <Loader2 className="w-6 h-6 animate-spin mb-3" style={{ color: 'var(--accent-secondary)' }}/>
                        <p className="font-medium animate-pulse text-sm" style={{ color: 'var(--text-secondary)' }}>
                           Generating audio briefing...
                        </p>
                      </div>
                    ) : (
                      audioUrl && (
                        <div className="w-full flex justify-center p-4 rounded-xl neu-pressed">
                          <audio 
                            controls 
                            autoPlay
                            className="w-full"
                            style={{ height: '40px', outline: 'none' }}
                            src={audioUrl}
                          />
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* ── TAB: Summary ────────────────────────────── */}
                {activeTab === 'summary' && (
                  <div className="content-panel">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg font-semibold flex items-center gap-3" style={{ color: 'var(--text-primary)' }}>
                            <span className="icon-badge"><Activity className="w-4 h-4" /></span>
                            AI Intelligence Brief
                        </h2>
                        <button onClick={() => { setUseVernacular(!useVernacular); if(activeStory) handleSummarize(activeStory); }} className={`neu-btn text-xs ${useVernacular ? '' : ''}`} style={{ color: useVernacular ? 'var(--accent-secondary)' : 'var(--text-muted)', fontSize: '0.75rem' }}>
                            {useVernacular ? '✓ Hinglish ON' : 'Hinglish OFF'}
                        </button>
                    </div>
                    
                    {loadingSummary ? <LoadingSkeleton /> : summary && typeof summary === 'object' && summary.summary ? (
                        <div className="space-y-6 animate-fade-slide-up">
                            {summary.decision_signal && (
                              <div className="flex items-center gap-3">
                                <DecisionSignal signal={summary.decision_signal} />
                              </div>
                            )}

                            <div>
                                <h3 className="font-semibold mb-2 uppercase text-xs tracking-wider pb-1" style={{ color: 'var(--accent-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>Executive Summary</h3>
                                <p className="font-light leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{summary.summary}</p>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="insight-card">
                                    <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: '#a855f7' }}>📊 Market Impact</h3>
                                    <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{summary.market_impact || 'N/A'}</p>
                                </div>
                                <div className="insight-card">
                                    <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-danger)' }}>⚡ Risks</h3>
                                    <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{summary.risks || 'N/A'}</p>
                                </div>
                                <div className="insight-card">
                                    <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-info)' }}>🎯 Actionable Insight</h3>
                                    <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{summary.actionable_insight || 'N/A'}</p>
                                </div>
                                <div className="insight-card">
                                    <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-warning)' }}>🔮 Future Prediction</h3>
                                    <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{summary.future_prediction || 'N/A'}</p>
                                </div>
                            </div>

                            {summary.contrarian_view && (
                              <div className="insight-card">
                                <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-warning)' }}>⚠️ Contrarian View</h3>
                                <p className="font-light text-sm italic" style={{ color: 'var(--text-secondary)' }}>{summary.contrarian_view}</p>
                              </div>
                            )}

                            {summary.second_order_effects && (
                              <div className="insight-card">
                                <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: '#818cf8' }}>🌊 Second-Order Effects</h3>
                                <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{summary.second_order_effects}</p>
                              </div>
                            )}

                            {summary.personalized_impact && (
                              <div className="insight-card">
                                <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: '#22d3ee' }}>👤 Impact on You ({role})</h3>
                                <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{summary.personalized_impact}</p>
                              </div>
                            )}

                            {summary.why_it_matters && !summary.actionable_insight && (
                              <div className="insight-card">
                                <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-info)' }}>Why It Matters</h3>
                                <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{summary.why_it_matters}</p>
                              </div>
                            )}
                        </div>
                    ) : (
                        <div className="prose max-w-none font-light leading-relaxed whitespace-pre-wrap CustomMarkdownStyle" style={{ color: 'var(--text-secondary)' }}>
                            {summary?.error ? <div className="p-3 rounded-xl neu-pressed" style={{ color: 'var(--accent-danger)' }}>{summary.error}</div> : null}
                            {summary?.summary || String(summary || "")}
                        </div>
                    )}
                  </div>
                )}

                {/* ── TAB: Navigator ─────────────────────────── */}
                {activeTab === 'navigator' && (
                  <div className="content-panel animate-fade-slide-up">
                    <h2 className="text-lg font-semibold flex items-center gap-3 mb-6" style={{ color: 'var(--text-primary)' }}>
                      <span className="icon-badge"><Zap className="w-4 h-4" /></span>
                      🧠 Unified Intelligence Brief
                    </h2>
                    
                    {loadingNavigator ? <LoadingSkeleton /> : navigatorBrief ? (
                      <div className="space-y-6 animate-fade-slide-up">
                        {navigatorArticles.length > 0 && (
                          <div className="text-xs neu-pressed p-4" style={{ color: 'var(--text-faint)' }}>
                            <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Analyzed {navigatorArticles.length} articles:</span>
                            <ul className="mt-2 space-y-1">
                              {navigatorArticles.map((t, i) => (
                                <li key={i} className="truncate" style={{ color: 'var(--text-faint)' }}>• {t}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div>
                          <h3 className="font-semibold mb-2 uppercase text-xs tracking-wider pb-1" style={{ color: 'var(--accent-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>Unified Analysis</h3>
                          <p className="font-light leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{navigatorBrief.unified_summary}</p>
                        </div>

                        {navigatorBrief.key_themes?.length > 0 && (
                          <div>
                            <h3 className="font-semibold mb-3 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-info)' }}>Key Themes</h3>
                            <div className="flex flex-wrap gap-2">
                              {navigatorBrief.key_themes.map((theme: string, i: number) => (
                                <span key={i} className="theme-tag">{theme}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {navigatorBrief.conflicting_signals?.length > 0 && (
                          <div className="insight-card">
                            <h3 className="font-semibold mb-2 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-warning)' }}>⚠️ Conflicting Signals</h3>
                            <ul className="space-y-1.5">
                              {navigatorBrief.conflicting_signals.map((sig: string, i: number) => (
                                <li key={i} className="font-light text-sm flex items-start gap-2" style={{ color: 'var(--text-secondary)' }}>
                                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-warning)' }} />
                                  {sig}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <div className="insight-card">
                            <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: '#a855f7' }}>📊 Market Impact</h3>
                            <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{navigatorBrief.market_impact || 'N/A'}</p>
                          </div>
                          <div className="insight-card">
                            <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-danger)' }}>⚡ Risks</h3>
                            <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{navigatorBrief.risks || 'N/A'}</p>
                          </div>
                          <div className="insight-card">
                            <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-secondary)' }}>💎 Opportunities</h3>
                            <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{navigatorBrief.opportunities || 'N/A'}</p>
                          </div>
                          <div className="insight-card">
                            <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-info)' }}>🎯 Actionable Insight</h3>
                            <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{navigatorBrief.actionable_insight || 'N/A'}</p>
                          </div>
                        </div>

                        {navigatorBrief.future_outlook && (
                          <div className="insight-card">
                            <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: '#22d3ee' }}>🔮 Future Outlook</h3>
                            <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{navigatorBrief.future_outlook}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="font-light text-sm" style={{ color: 'var(--text-faint)' }}>Click the Navigator tab to analyze related articles.</p>
                    )}
                  </div>
                )}

                {/* ── TAB: Story Arc ─────────────────────── */}
                {activeTab === 'storyarc' && (
                  <div className="content-panel animate-fade-slide-up">
                    <h2 className="text-lg font-semibold flex items-center gap-3 mb-6" style={{ color: 'var(--text-primary)' }}>
                      <span className="icon-badge"><Clock className="w-4 h-4" /></span>
                      📈 Story Arc Tracker
                    </h2>
                    
                    {loadingStoryArc ? <LoadingSkeleton /> : storyArc ? (
                      <div className="space-y-6 animate-fade-slide-up">
                        {storyArc.timeline?.length > 0 && (
                          <div>
                            <h3 className="font-semibold mb-4 uppercase text-xs tracking-wider pb-1" style={{ color: 'var(--accent-secondary)', borderBottom: '1px solid var(--border-subtle)' }}>Event Timeline</h3>
                            <div className="space-y-4 relative">
                              <div className="timeline-line"></div>
                              {storyArc.timeline.map((event: any, i: number) => (
                                <div key={i} className="flex items-start gap-0 relative" style={{animationDelay: `${i*100}ms`}}>
                                  <div className="timeline-dot"></div>
                                  <div className="timeline-event">
                                    <span className="text-[11px] font-mono font-medium" style={{ color: 'var(--accent-info)' }}>{event.date}</span>
                                    <p className="font-light text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{event.event}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          {storyArc.trend_analysis && (
                            <div className="insight-card">
                              <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-info)' }}>📊 Trend Analysis</h3>
                              <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{storyArc.trend_analysis}</p>
                            </div>
                          )}
                          {storyArc.sentiment_shift && (
                            <div className="insight-card">
                              <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: '#a855f7' }}>💭 Sentiment Shift</h3>
                              <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{storyArc.sentiment_shift}</p>
                            </div>
                          )}
                        </div>

                        {storyArc.key_turning_points?.length > 0 && (
                          <div className="insight-card">
                            <h3 className="font-semibold mb-2 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-warning)' }}>🔀 Key Turning Points</h3>
                            <ul className="space-y-1.5">
                              {storyArc.key_turning_points.map((tp: string, i: number) => (
                                <li key={i} className="font-light text-sm flex items-start gap-2" style={{ color: 'var(--text-secondary)' }}>
                                  <Target className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-warning)' }} />
                                  {tp}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {storyArc.what_changed && (
                          <div className="insight-card">
                            <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: 'var(--accent-secondary)' }}>🔄 What Changed</h3>
                            <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{storyArc.what_changed}</p>
                          </div>
                        )}

                        {storyArc.what_to_watch_next && (
                          <div className="insight-card animate-pulse-glow">
                            <h3 className="font-semibold mb-1.5 uppercase text-xs tracking-wider" style={{ color: '#22d3ee' }}>👁️ What to Watch Next</h3>
                            <p className="font-light text-sm" style={{ color: 'var(--text-secondary)' }}>{storyArc.what_to_watch_next}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="font-light text-sm" style={{ color: 'var(--text-faint)' }}>Click the Story Arc tab to track this story over time.</p>
                    )}
                  </div>
                )}
            </div>
        ) : (
            <div className="flex flex-col items-center justify-center h-full text-center z-10 relative">
                <div className="neu-convex p-8 rounded-full mb-6 animate-float" style={{ borderRadius: '50%' }}>
                  <Activity className="w-12 h-12" style={{ color: 'var(--text-faint)' }} />
                </div>
                <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-secondary)' }}>Select an article for AI Briefing</h2>
                <p className="text-sm mt-3 max-w-sm font-light" style={{ color: 'var(--text-faint)' }}>Multi-article intelligence, story arc tracking, decision signals, and context-aware chat — all powered by hybrid AI.</p>
            </div>
        )}
      </div>

      {/* ── Chat Copilot Floating Button ────────────────────────── */}
      {!isChatOpen && (
          <button 
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-8 right-8 z-50 neu-btn-accent p-4 hover:scale-110 transition-all duration-300"
            style={{ borderRadius: '50%', boxShadow: '0 8px 32px rgba(108, 99, 255, 0.4), var(--neu-soft)' }}
          >
            <MessageSquare className="w-6 h-6" />
          </button>
      )}

      {/* ── Chat Copilot Panel ─────────────── */}
      {isChatOpen && (
          <div className="fixed bottom-8 right-8 w-[420px] h-[680px] chat-panel flex flex-col animate-fade-slide-up z-50">
              <div className="p-5 chat-header flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                      <MessageSquare className="w-4 h-4" style={{ color: 'var(--accent-primary)' }}/>
                      Context Co-Pilot
                      <ModelBadge model={chatModel} />
                    </h3>
                    {activeStory && <p className="text-[10px] mt-0.5 truncate max-w-[280px]" style={{ color: 'var(--text-faint)' }}>📎 {activeStory.title}</p>}
                  </div>
                  <button onClick={() => setIsChatOpen(false)} className="neu-btn" style={{ padding: '0.35rem', borderRadius: '10px' }}>
                      <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }}/>
                  </button>
              </div>
              
              <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-4 custom-scrollbar" style={{ background: 'var(--bg-primary)' }}>
                  {chatMessages.length === 0 && (
                      <div className="text-center my-auto text-sm font-light px-6" style={{ color: 'var(--text-faint)' }}>
                          <div className="neu-convex p-4 mx-auto mb-4 inline-block" style={{ borderRadius: '50%' }}>
                            <MessageSquare className="w-6 h-6" style={{ color: 'var(--text-faint)', opacity: 0.5 }} />
                          </div>
                          <p>Ask about implications, risks, or opportunities. Context from your current article and role is automatically included.</p>
                      </div>
                  )}
                  {chatMessages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] p-3.5 text-sm font-light leading-relaxed ${m.role === 'user' ? 'chat-msg-user' : 'chat-msg-ai'}`}>
                              {m.content ? (
                                <ReactMarkdown
                                  components={{
                                    strong: ({node, ...props}) => <strong className="font-semibold" style={{ color: m.role === 'user' ? 'white' : 'var(--text-primary)' }} {...props} />,
                                    p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                                    ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 last:mb-0 space-y-1" {...props} />,
                                    ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3 last:mb-0 space-y-1" {...props} />,
                                    li: ({node, ...props}) => <li className="" {...props} />
                                  }}
                                >
                                  {m.content}
                                </ReactMarkdown>
                              ) : <span className="italic" style={{ color: 'var(--text-faint)' }}>Thinking...</span>}
                          </div>
                      </div>
                  ))}
                  {loadingChat && (
                      <div className="flex justify-start">
                          <div className="chat-msg-ai p-3.5 flex items-center gap-3 text-sm font-light" style={{ color: 'var(--text-muted)' }}>
                              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--accent-primary)' }}/> Analyzing context...
                          </div>
                      </div>
                  )}
                  <div ref={chatEndRef} />
              </div>

              {/* Quick Actions */}
              <div className="px-4 pt-2 pb-1 flex gap-1.5 flex-wrap" style={{ background: 'var(--bg-secondary)' }}>
                {QUICK_ACTIONS.map((action, i) => (
                  <button 
                    key={i}
                    onClick={() => handleQuickAction(action.prompt)}
                    disabled={loadingChat}
                    className="quick-action disabled:opacity-30"
                  >
                    {action.icon} {action.label}
                  </button>
                ))}
              </div>

              <div className="p-4 chat-header" style={{ borderTop: '1px solid var(--border-subtle)', borderBottom: 'none' }}>
                  <div className="relative">
                      <input 
                          type="text" 
                          placeholder="Ask about implications, risks, strategy..." 
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleChat()}
                          className="w-full neu-input pr-12"
                          style={{ borderRadius: '9999px', padding: '0.85rem 1.25rem' }}
                      />
                      <button 
                          onClick={() => handleChat()}
                          disabled={!chatInput.trim() || loadingChat}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 neu-btn-accent disabled:opacity-50 active:scale-95 transition-all"
                          style={{ borderRadius: '50%', padding: '0.5rem' }}
                      >
                          <Send className="w-4 h-4 ml-0.5" />
                      </button>
                  </div>
              </div>
          </div>
      )}
      {/* ── Settings Modal ───────────────────────────────────────── */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center animate-fade-in" style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
          <div className="content-panel max-w-md w-full mx-4" style={{ boxShadow: '20px 20px 40px var(--shadow-dark-strong), -20px -20px 40px var(--shadow-light-strong)' }}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                <span className="icon-badge" style={{ padding: '0.35rem', borderRadius: '10px' }}><Settings className="w-4 h-4" /></span>
                Settings
              </h3>
              <button onClick={() => setIsSettingsOpen(false)} className="neu-btn" style={{ padding: '0.35rem', borderRadius: '10px' }}>
                <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }}/>
              </button>
            </div>
            
            <div className="space-y-5">
              {/* Theme Setting */}
              <div className="neu-pressed p-4" style={{ borderRadius: '16px' }}>
                <div className="flex justify-between items-center">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Appearance</label>
                    <p className="text-xs font-light" style={{ color: 'var(--text-faint)' }}>{isDark ? 'Dark mode active' : 'Light mode active'}</p>
                  </div>
                  <button onClick={toggleTheme} className="theme-toggle" aria-label="Toggle theme">
                    <div className={`theme-toggle-knob ${isDark ? 'dark-active' : ''}`}>
                      {isDark ? '🌙' : '☀️'}
                    </div>
                  </button>
                </div>
              </div>

              {/* Gemini API Key */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Gemini API Key</label>
                <div className="flex gap-2">
                  <input 
                    type="password"
                    placeholder={geminiKeyStatus.is_set ? `Current: ${geminiKeyStatus.masked_key}` : "Enter your Google Gemini API Key"}
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    className="w-full neu-input"
                  />
                  {geminiKeyStatus.is_set && <span className="self-center text-xs" style={{ color: 'var(--accent-secondary)' }}>✓</span>}
                </div>
                <p className="text-xs mt-2 font-light" style={{ color: 'var(--text-faint)' }}>
                  Primary AI model. Get from <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>Google AI Studio</a>.
                </p>
              </div>

              {/* Groq Key */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Groq API Key</label>
                <div className="flex gap-2">
                  <input 
                    type="password"
                    placeholder={groqKeyStatus.is_set ? `Current: ${groqKeyStatus.masked_key}` : "Enter your Groq API Key"}
                    value={groqKeyInput}
                    onChange={(e) => setGroqKeyInput(e.target.value)}
                    className="w-full neu-input"
                  />
                  {groqKeyStatus.is_set && <span className="self-center text-xs" style={{ color: 'var(--accent-secondary)' }}>✓</span>}
                </div>
                <p className="text-xs mt-2 font-light" style={{ color: 'var(--text-faint)' }}>
                  Lightning fast LLaMA 3 inference. Get from <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>Groq Console</a>.
                </p>
              </div>

              {/* OpenRouter Key */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>OpenRouter API Key</label>
                <div className="flex gap-2">
                  <input 
                    type="password"
                    placeholder={openrouterKeyStatus.is_set ? `Current: ${openrouterKeyStatus.masked_key}` : "Enter your OpenRouter API Key"}
                    value={openrouterKeyInput}
                    onChange={(e) => setOpenrouterKeyInput(e.target.value)}
                    className="w-full neu-input"
                  />
                  {openrouterKeyStatus.is_set && <span className="self-center text-xs" style={{ color: 'var(--accent-secondary)' }}>✓</span>}
                </div>
                <p className="text-xs mt-2 font-light" style={{ color: 'var(--text-faint)' }}>
                  Deep fallback router. Get from <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>OpenRouter</a>.
                </p>
              </div>

              {/* D-ID Key */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>D-ID API Key (Video Gen)</label>
                <div className="flex gap-2">
                  <input 
                    type="password"
                    placeholder={didKeyStatus.is_set ? `Current: ${didKeyStatus.masked_key}` : "Enter your D-ID API Key"}
                    value={didKeyInput}
                    onChange={(e) => setDidKeyInput(e.target.value)}
                    className="w-full neu-input"
                  />
                  {didKeyStatus.is_set && <span className="self-center text-xs" style={{ color: 'var(--accent-secondary)' }}>✓</span>}
                </div>
                <p className="text-xs mt-2 font-light" style={{ color: 'var(--text-faint)' }}>
                  Required for AI Avatar Video generation. Get from <a href="https://studio.d-id.com/settings/api" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>D-ID Studio</a>.
                </p>
              </div>

              {/* Fallback Chain Info */}
              <div className="neu-pressed p-4" style={{ borderRadius: '16px' }}>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>AI Fallback Chain</label>
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="px-2 py-1 rounded-lg" style={{ background: geminiKeyStatus.is_set ? 'rgba(67, 233, 123, 0.15)' : 'rgba(252, 92, 101, 0.15)', color: geminiKeyStatus.is_set ? 'var(--accent-secondary)' : 'var(--accent-danger)' }}>Gemini</span>
                  <span style={{ color: 'var(--text-faint)' }}>→</span>
                  <span className="px-2 py-1 rounded-lg" style={{ background: groqKeyStatus.is_set ? 'rgba(67, 233, 123, 0.15)' : 'rgba(252, 92, 101, 0.15)', color: groqKeyStatus.is_set ? 'var(--accent-secondary)' : 'var(--accent-danger)' }}>Groq</span>
                  <span style={{ color: 'var(--text-faint)' }}>→</span>
                  <span className="px-2 py-1 rounded-lg" style={{ background: openrouterKeyStatus.is_set ? 'rgba(67, 233, 123, 0.15)' : 'rgba(252, 92, 101, 0.15)', color: openrouterKeyStatus.is_set ? 'var(--accent-secondary)' : 'var(--accent-danger)' }}>OpenRouter</span>
                  <span style={{ color: 'var(--text-faint)' }}>→</span>
                  <span className="px-2 py-1 rounded-lg" style={{ background: 'rgba(246, 173, 85, 0.15)', color: 'var(--accent-warning)' }}>Ollama (local)</span>
                </div>
                <p className="text-xs mt-2 font-light" style={{ color: 'var(--text-faint)' }}>
                  If the primary model fails, the system automatically tries the next one.
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="neu-btn text-sm"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveAllSettings}
                disabled={(savingKey || savingGroqKey || savingOpenrouterKey || savingDidKey) || (!geminiKeyInput.trim() && !groqKeyInput.trim() && !openrouterKeyInput.trim() && !didKeyInput.trim())}
                className="neu-btn-accent text-sm disabled:opacity-50 flex items-center gap-2"
              >
                {(savingKey || savingGroqKey || savingOpenrouterKey || savingDidKey) ? <Loader2 className="w-4 h-4 animate-spin"/> : null}
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
