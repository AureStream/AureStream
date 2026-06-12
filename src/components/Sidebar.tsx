import { useTranslation } from "react-i18next"
import { NavLink, useNavigate } from "react-router-dom"
import { useTheme } from "./ThemeProvider"
import TrafficGraph from "./TrafficGraph"

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
    <aside className="sidebar glass-sidebar">
      {/* Brand */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>
          </svg>
        </div>
        <span className="sidebar-brand-text">AureStream</span>
      </div>

      {/* Main navigation */}
      <nav className="sidebar-nav">
        {mainNav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            style={{ position: "relative" }}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="sidebar-footer">
        {/* Traffic mini widget */}
        <div className="rounded-xl bg-bg-alt/50 p-3 border border-border-light">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">实时速度</span>
          </div>
          <TrafficGraph mini height={40} />
          <div className="flex justify-between mt-1.5 text-[10px] font-mono">
            <span className="flex items-center gap-1 text-primary">
              <I.Download /> 8.2 MB/s
            </span>
            <span className="flex items-center gap-1 text-secondary">
              <I.Upload /> 2.4 MB/s
            </span>
          </div>
        </div>

        {/* User info */}
        <div className="flex items-center gap-2.5 px-1.5 py-2">
          <div className="avatar w-8 h-8 text-xs">U</div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">User</div>
            <div className="text-[11px] text-text-muted truncate">user@example.com</div>
          </div>
        </div>

        {/* Upgrade banner */}
        <div
          onClick={() => navigate("/dashboard/subscription")}
          className="cursor-pointer rounded-xl p-3.5 bg-gradient-to-br from-primary to-secondary text-white transition-all duration-200 hover:shadow-glow-primary hover:scale-[1.02]"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <I.Zap />
            <span className="text-[13px] font-semibold">{t("upgrade_prompt")}</span>
          </div>
          <p className="text-[11px] opacity-75 leading-relaxed">{t("upgrade_desc")}</p>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between px-1">
          <button onClick={toggleTheme} className="nav-item !w-auto !p-2" title={theme === "light" ? "深色模式" : "浅色模式"}>
            {theme === "light" ? <I.Moon /> : <I.Sun />}
          </button>
          <div className="lang-selector">
            <button className={`lang-option${i18n.language === "en" ? " active" : ""}`} onClick={() => i18n.changeLanguage("en")}>EN</button>
            <button className={`lang-option${i18n.language.startsWith("zh") ? " active" : ""}`} onClick={() => i18n.changeLanguage("zh")}>中</button>
          </div>
          <button onClick={() => navigate("/login")} className="nav-item !w-auto !p-2" title={t("logout")}>
            <I.Logout />
          </button>
        </div>
      </div>
    </aside>
  )
}
