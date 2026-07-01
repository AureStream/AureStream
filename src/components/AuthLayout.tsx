import { Outlet } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useTheme } from "./ThemeProvider"

const I = {
  Moon: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>),
  Sun: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>),
  Rocket: () => (<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>),
  Shield: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>),
  Activity: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>),
  Network: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/></svg>),
}

export default function AuthLayout() {
  const { i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex h-full w-full bg-bg font-sans overflow-hidden relative bg-mesh-vibrant">
      
      {/* Background Decorative Blurs */}
      <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-secondary opacity-[0.12] rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent-purple opacity-[0.1] rounded-full blur-[90px] pointer-events-none"></div>

      {/* Top Controls (Persistent) */}
      <div className="absolute top-6 right-6 md:right-8 flex items-center gap-4 z-20">
        <button 
          onClick={toggleTheme}
          className="text-text-secondary hover:text-primary transition-colors shrink-0"
        >
          {theme === 'dark' ? <I.Moon /> : <I.Sun />}
        </button>
        
        <div className="flex bg-surface-active/50 rounded-xl p-1 border border-border-glass shadow-sm">
          <button 
            onClick={() => i18n.changeLanguage("zh")}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${i18n.language.startsWith("zh") ? 'glass-active-pill' : 'text-text-muted hover:text-text'}`}
          >
            中文
          </button>
          <button 
            onClick={() => i18n.changeLanguage("en")}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${!i18n.language.startsWith("zh") ? 'glass-active-pill' : 'text-text-muted hover:text-text'}`}
          >
            EN
          </button>
        </div>
      </div>

      {/* Center Modal Area */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 sm:p-6 w-full">

        {/* The Liquid Glass Form Modal */}
        <div className="glass-panel w-full max-w-[440px] rounded-[32px] p-8 md:p-10 flex flex-col relative overflow-hidden">
           <Outlet />
        </div>
      </div>

    </div>
  )
}
