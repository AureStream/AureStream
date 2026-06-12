import { useTranslation } from "react-i18next"
import { NavLink, useNavigate } from "react-router-dom"
import { useTheme } from "./ThemeProvider"

/* Icons */
const I = {
  Home: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>),
  Plans: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>),
  Settings: () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>),
  Sun: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>),
  Moon: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>),
  Logout: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>),
  Zap: () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>),
  Download: () => (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>),
  Upload: () => (<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17,8 12,3 7,8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>),
}

export default function Sidebar() {
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const mainNav = [
    { to: "/dashboard", icon: <I.Home />, label: t("nav_home"), end: true },
    { to: "/dashboard/subscription", icon: <I.Plans />, label: t("nav_subscription") },
    { to: "/dashboard/settings", icon: <I.Settings />, label: t("nav_settings") },
  ]

  return (
    <aside className="sidebar bg-surface border-r border-border shadow-sm flex flex-col z-40">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-8">
        <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-sm">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>
          </svg>
        </div>
        <span className="font-heading font-bold text-xl tracking-tight text-text">AureStream</span>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 px-4 py-2 flex flex-col gap-2">
        <div className="text-xs font-bold text-text-muted uppercase tracking-wider mb-2 px-4">Menu</div>
        {mainNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl font-medium text-sm transition-all duration-200 ${isActive ? "bg-primary text-white shadow-md" : "text-text-secondary hover:bg-surface-active hover:text-text"}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="p-6 flex flex-col gap-6 border-t border-border mt-auto">
        {/* User info */}
        <div className="flex items-center gap-3 bg-surface-active p-3 rounded-2xl">
          <div className="w-10 h-10 rounded-xl bg-accent-blue flex items-center justify-center font-bold text-accent-blue-text">
            JD
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-text truncate">John Doe</div>
            <div className="text-xs text-text-muted truncate">john@example.com</div>
          </div>
        </div>

        {/* Upgrade banner */}
        <div
          onClick={() => navigate("/dashboard/subscription")}
          className="cursor-pointer rounded-2xl p-5 bg-gradient-to-br from-primary to-primary-hover text-white transition-transform hover:scale-105 shadow-md relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-white opacity-10 rounded-full blur-xl -mr-10 -mt-10"></div>
          <div className="flex items-center gap-2 mb-2 relative z-10">
            <I.Zap />
            <span className="text-sm font-bold">{t("upgrade_prompt")}</span>
          </div>
          <p className="text-xs opacity-80 leading-relaxed relative z-10">{t("upgrade_desc")}</p>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between px-2 text-text-secondary">
          <button onClick={toggleTheme} className="hover:text-primary transition-colors p-2" title={theme === "light" ? "深色模式" : "浅色模式"}>
            {theme === "light" ? <I.Moon /> : <I.Sun />}
          </button>
          <div className="flex items-center bg-surface-active rounded-lg p-1">
            <button className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${i18n.language === "en" ? "bg-white text-text shadow-sm" : "text-text-muted hover:text-text"}`} onClick={() => i18n.changeLanguage("en")}>EN</button>
            <button className={`px-2 py-1 text-xs rounded-md font-medium transition-colors ${i18n.language.startsWith("zh") ? "bg-white text-text shadow-sm" : "text-text-muted hover:text-text"}`} onClick={() => i18n.changeLanguage("zh")}>中</button>
          </div>
          <button onClick={() => navigate("/login")} className="hover:text-danger transition-colors p-2" title={t("logout")}>
            <I.Logout />
          </button>
        </div>
      </div>
    </aside>
  )
}
