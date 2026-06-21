import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "light" | "dark"
export type ThemeMode = "system" | "light" | "dark"

interface ThemeContextType {
  /** Resolved theme actually applied to the UI. */
  theme: Theme
  /** User-selected mode (system follows OS preference). */
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  /** Explicit light/dark toggle (sets mode away from system). */
  toggleTheme: () => void
}

const STORAGE_KEY = "aurestream-theme"

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  mode: "system",
  setMode: () => {},
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolveTheme(mode: ThemeMode): Theme {
  return mode === "system" ? systemTheme() : mode
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "dark" || saved === "light" || saved === "system") return saved
    return "system"
  })

  const [theme, setTheme] = useState<Theme>(() => resolveTheme(mode))

  // Apply resolved theme + persist the selected mode.
  useEffect(() => {
    const resolved = resolveTheme(mode)
    setTheme(resolved)
    document.documentElement.setAttribute("data-theme", resolved)
    localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  // Follow live OS changes only while in system mode.
  useEffect(() => {
    if (mode !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => {
      const resolved = systemTheme()
      setTheme(resolved)
      document.documentElement.setAttribute("data-theme", resolved)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [mode])

  const setMode = (next: ThemeMode) => setModeState(next)

  const toggleTheme = () => setModeState(resolveTheme(mode) === "light" ? "dark" : "light")

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
