import { Outlet } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useTheme } from "./ThemeProvider"

const I = {
  Moon: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>),
  Sun: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>),
  Rocket: () => (<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>),
}

export default function AuthLayout() {
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex min-h-screen w-full bg-bg font-sans overflow-hidden">
      
      {/* Left Brand Panel (Persistent) */}
      <div className="hidden md:flex md:w-[60%] lg:w-[60%] relative flex-col items-center justify-center p-12 overflow-hidden border-r border-border-glass">
        {/* Background Glowing Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-accent-blue rounded-full blur-[120px] opacity-70 pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-accent-purple rounded-full blur-[140px] opacity-50 pointer-events-none"></div>
        
        <div className="relative z-10 flex flex-col items-center text-center animate-fade-in max-w-md">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white shadow-glow-primary mb-8 border border-white/20">
            <I.Rocket />
          </div>
          <h1 className="text-5xl font-heading font-bold text-text mb-4 tracking-tight">AureStream</h1>
          <p className="text-xl font-medium text-text-secondary mb-3">{t("brand_tagline")}</p>
          <p className="text-sm text-text-muted leading-relaxed max-w-xs">{t("brand_description")}</p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex flex-col relative bg-surface/80 backdrop-blur-3xl overflow-y-auto no-scrollbar">
        
        {/* Top Controls (Persistent) */}
        <div className="absolute top-6 right-8 flex items-center gap-4 z-20">
          <button 
            onClick={toggleTheme}
            className={`w-14 h-8 rounded-full p-1 transition-colors relative shadow-inner ${theme === 'dark' ? 'bg-primary' : 'bg-surface-hover border border-border-glass'}`}
          >
            <div className={`w-6 h-6 rounded-full bg-white flex items-center justify-center text-text-muted transition-transform absolute top-1 ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0'}`}>
               {theme === "dark" ? <I.Moon /> : <I.Sun />}
            </div>
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

        {/* Dynamic Outlet for Login/Register Form */}
        <div className="flex-1 flex flex-col justify-center items-center p-8 py-16 relative z-10">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
