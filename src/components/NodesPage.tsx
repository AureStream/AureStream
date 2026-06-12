import { useState } from "react"
import { useTranslation } from "react-i18next"

/* ── Icons ── */
const I = {
  Search: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>),
  Filter: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>),
  Activity: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>),
  Wifi: () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>),
  Zap: () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>)
}

interface NodeData {
  id: string
  name: string
  flag: string
  ping: number
  protocol: string
  region: "asia" | "america" | "europe"
}

export default function NodesPage() {
  const { i18n } = useTranslation()
  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;
  
  const [searchQuery, setSearchQuery] = useState("")
  const [activeRegion, setActiveRegion] = useState<"all" | "asia" | "america" | "europe">("all")
  const [connectedNodeId, setConnectedNodeId] = useState<string>("jp-1")

  const initialNodes: NodeData[] = [
    { id: "jp-1", name: l("Tokyo, JP - Premium 01", "日本 东京 - 专线 01"), flag: "🇯🇵", ping: 45, protocol: "Trojan", region: "asia" },
    { id: "jp-2", name: l("Tokyo, JP - Standard 02", "日本 东京 - 标准 02"), flag: "🇯🇵", ping: 52, protocol: "Vmess", region: "asia" },
    { id: "sg-1", name: l("Singapore - Optim", "新加坡 - 优化节点"), flag: "🇸🇬", ping: 68, protocol: "Shadowsocks", region: "asia" },
    { id: "hk-1", name: l("Hong Kong - IEPL", "中国 香港 - 专线"), flag: "🇭🇰", ping: 35, protocol: "Trojan", region: "asia" },
    { id: "us-1", name: l("Los Angeles, US - 01", "美国 洛杉矶 - 01"), flag: "🇺🇸", ping: 142, protocol: "Vless", region: "america" },
    { id: "us-2", name: l("New York, US - 02", "美国 纽约 - 02"), flag: "🇺🇸", ping: 165, protocol: "Vmess", region: "america" },
    { id: "uk-1", name: l("London, UK - Main", "英国 伦敦 - 主干"), flag: "🇬🇧", ping: 210, protocol: "Shadowsocks", region: "europe" },
    { id: "de-1", name: l("Frankfurt, DE", "德国 法兰克福"), flag: "🇩🇪", ping: 195, protocol: "Trojan", region: "europe" },
  ]

  const [nodes, setNodes] = useState<NodeData[]>(initialNodes)
  const [isTestingSpeed, setIsTestingSpeed] = useState(false)

  const handleSpeedTest = () => {
    if (isTestingSpeed) return;
    setIsTestingSpeed(true);
    
    // Simulate setting pings to 0 while testing
    setNodes(prev => prev.map(n => ({ ...n, ping: 0 })));

    // Simulate network delay and randomize new pings
    setTimeout(() => {
      setNodes(prev => prev.map(n => {
        // Create realistic random variance based on the original ping
        const originalPing = initialNodes.find(inNode => inNode.id === n.id)?.ping || 100;
        const variance = Math.floor(Math.random() * 20) - 10; // -10 to +10 ms
        return { ...n, ping: Math.max(10, originalPing + variance) };
      }));
      setIsTestingSpeed(false);
    }, 1500);
  }

  const filteredNodes = nodes.filter(node => {
    const matchesSearch = node.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesRegion = activeRegion === "all" || node.region === activeRegion
    return matchesSearch && matchesRegion
  })

  return (
    <div className="flex flex-col gap-8 w-full max-w-[1200px] mx-auto animate-fade-in px-4 md:px-8 pb-32 pt-4">
      
      {/* Hero Banner */}
      <div className="relative overflow-hidden rounded-[32px] bg-surface/60 backdrop-blur-2xl border border-border-glass shadow-sm p-8 mt-2 flex flex-col items-start justify-between">
        <div className="absolute -right-24 -top-24 w-80 h-80 bg-accent-purple/20 blur-[100px] rounded-full pointer-events-none"></div>
        <div className="absolute left-1/4 -bottom-20 w-64 h-64 bg-primary/10 blur-[80px] rounded-full pointer-events-none"></div>
        
        <div className="relative z-10 w-full flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-[32px] font-heading font-bold tracking-tight text-text mb-2">
              {l("Global Network", "全球加速网络")} 🌍
            </h1>
            <p className="text-text-secondary text-[15px] max-w-lg leading-relaxed">
              {l("Choose from our high-performance edge nodes to ensure optimal speed and absolute privacy.", "选择高性能边缘节点，确保极速连接与绝对的网络隐私。")}
            </p>
          </div>
          
          <div className="w-full md:w-auto flex items-center gap-3">
            <div className="relative w-full md:w-64">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"><I.Search /></div>
              <input 
                type="text" 
                placeholder={l("Search location...", "搜索国家或城市...")} 
                className="w-full bg-surface-active/50 border border-border-glass text-sm text-text rounded-2xl pl-10 pr-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button 
              onClick={handleSpeedTest}
              disabled={isTestingSpeed}
              className="h-[42px] px-4 rounded-2xl bg-primary text-white hover:bg-primary/90 transition-all shadow-sm flex items-center gap-2 shrink-0 text-sm font-semibold disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <div className={isTestingSpeed ? 'animate-pulse' : ''}><I.Activity /></div>
              <span className="hidden sm:inline">{isTestingSpeed ? l("Testing...", "测速中...") : l("Test Speed", "延迟测速")}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Region Tabs (iOS Segmented Style) */}
      <div className="flex items-center gap-2 bg-surface-active/40 p-1.5 rounded-2xl w-fit border border-border-glass">
        {(["all", "asia", "america", "europe"] as const).map(region => {
          const labels = {
            all: l("All Regions", "全部节点"),
            asia: l("Asia Pacific", "亚太地区"),
            america: l("Americas", "美洲地区"),
            europe: l("Europe", "欧洲地区")
          }
          return (
            <button
              key={region}
              onClick={() => setActiveRegion(region)}
              className={`px-6 py-2 rounded-xl text-sm font-semibold transition-all ${activeRegion === region ? 'glass-active-pill' : 'text-text-secondary hover:text-text hover:bg-surface-active/60'}`}
            >
              {labels[region]}
            </button>
          )
        })}
      </div>

      {/* Nodes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredNodes.map(node => {
          const isConnected = connectedNodeId === node.id
          
          return (
            <div 
              key={node.id}
              onClick={() => setConnectedNodeId(node.id)}
              className={`group relative overflow-hidden rounded-[24px] p-5 cursor-pointer transition-all duration-300 ${isConnected ? 'bg-primary border-primary text-white shadow-glow-primary scale-100' : 'bg-surface/80 backdrop-blur-xl border border-border-glass text-text hover:bg-surface hover:-translate-y-1 hover:shadow-glass-hover scale-100'}`}
            >
              {isConnected && (
                <div className="absolute -right-10 -top-10 w-32 h-32 bg-white/20 blur-2xl rounded-full pointer-events-none"></div>
              )}
              
              <div className="flex justify-between items-start mb-4 relative z-10">
                <div className="flex items-center gap-3">
                  <div className={`text-3xl ${isConnected ? 'drop-shadow-md' : ''}`}>{node.flag}</div>
                  <div>
                    <h3 className={`font-bold font-heading text-base ${isConnected ? 'text-white' : 'text-text'}`}>{node.name}</h3>
                    <div className={`text-xs mt-0.5 font-mono flex items-center gap-1 ${isConnected ? 'text-white/80' : 'text-text-muted'}`}>
                      ID: {node.id.toUpperCase()}
                    </div>
                  </div>
                </div>
                
                <div className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 ${isConnected ? 'bg-white/20 text-white' : 'bg-surface-active text-text-secondary border border-border-glass'}`}>
                  {isTestingSpeed ? (
                    <span className="animate-pulse">-- ms</span>
                  ) : (
                    <>
                      <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-text-muted'}`}></div>
                      {node.ping}ms
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mt-6 relative z-10">
                <div className="flex items-center gap-2">
                  <div className={`px-2 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase ${isConnected ? 'bg-white/20 text-white' : 'bg-surface-active text-text-secondary border border-border-glass'}`}>
                    {node.protocol}
                  </div>
                  <div className={`text-[11px] font-semibold ${isConnected ? 'text-white/80' : 'text-success'}`}>
                    {isTestingSpeed ? l("Testing...", "探测中...") : l("Available", "节点可用")}
                  </div>
                </div>
                
                <button className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isConnected ? 'bg-white text-primary shadow-sm' : 'bg-surface-active/50 border border-border-glass text-text-secondary group-hover:bg-primary group-hover:text-white group-hover:border-primary'}`}>
                  {isConnected ? <I.Zap /> : <I.Wifi />}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      
      {filteredNodes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-text-muted">
          <I.Search />
          <p className="mt-4 text-sm">{l("No nodes found matching your criteria.", "未找到符合条件的节点。")}</p>
        </div>
      )}
    </div>
  )
}
