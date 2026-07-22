import { Outlet } from "react-router-dom"
import { useTranslation } from "react-i18next"

export default function AuthLayout() {
  const { i18n } = useTranslation()

  return (
    <div className="flex h-full w-full bg-bg font-sans overflow-hidden relative bg-mesh-vibrant">

      {/* Background Decorative Blurs */}
      <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-secondary opacity-[0.12] rounded-full blur-[80px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-accent-purple opacity-[0.1] rounded-full blur-[90px] pointer-events-none"></div>

      {/* Top Controls (Persistent) — language switch only (theme removed) */}
      <div className="absolute top-6 right-6 md:right-8 flex items-center gap-4 z-20">
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