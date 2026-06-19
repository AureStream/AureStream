import { useTranslation } from "react-i18next"
import { NavLink, useNavigate } from "react-router-dom"
import { useTheme } from "./ThemeProvider"
import { useAuth } from "../contexts/AuthContext"

/* Icons */
const I = {
  Home: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>),
  Globe: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/><path d="M2 12h20"/></svg>),
  Plans: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>),
  Settings: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  User: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>),
  Sun: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>),
  Moon: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>),
  Logout: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>),
  Zap: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>),
}

export default function Sidebar() {
  const { i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const { user } = useAuth()
  const navigate = useNavigate()

  const l = (en: string, zh: string) => i18n.language.startsWith('zh') ? zh : en;

  const mainNav = [
    { to: "/dashboard", icon: <I.Home />, label: l("Dashboard", "首页"), end: true },
    { to: "/dashboard/nodes", icon: <I.Globe />, label: l("Nodes", "节点") },
    { to: "/dashboard/settings", icon: <I.Settings />, label: l("Settings", "设置") },
    { to: "/dashboard/profile", icon: <I.User />, label: l("Profile", "个人中心") },
  ]

  const emailUser = user?.email ?? "User";
  const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(emailUser)}&background=5C67F2&color=fff`;

  return (
    <aside className="glass-sidebar w-[72px] shrink-0 flex flex-col z-40 h-full border-r border-border-glass items-center">
      {/* Brand / User Avatar */}
      <div className="flex flex-col items-center justify-center py-6">
        <img
          src={avatarUrl}
          alt="Avatar"
          className="w-10 h-10 aspect-square shrink-0 rounded-full object-cover shadow-glow-primary border border-border-glass cursor-pointer hover:scale-105 active:scale-95 transition-all duration-200"
          onClick={() => navigate("/dashboard/profile")}
          title={l("Profile", "个人中心")}
        />
      </div>

      {/* Main navigation */}
      <nav className="flex-1 w-full px-2 flex flex-col gap-4 z-10 items-center mt-2">
        {mainNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `group relative w-11 h-11 flex items-center justify-center rounded-xl font-bold transition-all duration-200 ${isActive ? "text-secondary dark:text-white" : "text-text-secondary/70 hover:text-text hover:bg-surface-active/40"}`}
          >
            {({ isActive }) => (
              <>
                {/* Left Discord-style Active Indicator */}
                <div className={`absolute left-0 w-[3px] h-4 bg-secondary rounded-r-md transition-all duration-200 ${isActive ? 'opacity-100 scale-y-100' : 'opacity-0 scale-y-50'}`} />
                
                <span className="shrink-0 transition-transform group-hover:scale-105">{item.icon}</span>
                
                {/* Futuristic Glass Floating Tooltip */}
                <span className="absolute left-[64px] bg-primary/95 dark:bg-bg/95 backdrop-blur-md text-white dark:text-text text-[11px] font-extrabold px-3 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-250 shadow-lg border border-border-glass/40 translate-x-[-8px] group-hover:translate-x-0 whitespace-nowrap z-50">
                  {item.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="py-6 flex flex-col gap-4 border-t border-border-glass mt-auto z-10 w-full items-center px-2">
        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme} 
          className="group relative w-10 h-10 flex items-center justify-center hover:text-primary hover:bg-surface-active/40 rounded-xl transition-all text-text-secondary cursor-pointer"
        >
          {theme === "light" ? <I.Moon /> : <I.Sun />}
          
          <span className="absolute left-[64px] bg-primary/95 dark:bg-bg/95 backdrop-blur-md text-white dark:text-text text-[11px] font-extrabold px-3 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-250 shadow-lg border border-border-glass/40 translate-x-[-8px] group-hover:translate-x-0 whitespace-nowrap z-50">
            {theme === "light" ? l("Dark Mode", "深色模式") : l("Light Mode", "浅色模式")}
          </span>
        </button>
        
        {/* Language Switch */}
        <button 
          className="group relative text-[11px] font-extrabold text-text-secondary hover:text-primary w-10 h-10 flex items-center justify-center bg-surface-active/40 hover:bg-surface-active/80 border border-border-glass/40 rounded-xl shadow-sm transition-all cursor-pointer"
          onClick={() => i18n.changeLanguage(i18n.language.startsWith("zh") ? "en" : "zh")}
        >
          {i18n.language.startsWith("zh") ? "EN" : "中"}
          
          <span className="absolute left-[64px] bg-primary/95 dark:bg-bg/95 backdrop-blur-md text-white dark:text-text text-[11px] font-extrabold px-3 py-1.5 rounded-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-250 shadow-lg border border-border-glass/40 translate-x-[-8px] group-hover:translate-x-0 whitespace-nowrap z-50">
            {l("Switch Language", "切换语言")}
          </span>
        </button>
      </div>
    </aside>
  )
}
