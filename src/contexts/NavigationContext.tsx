import { createContext, useContext, useState, type ReactNode } from "react"

type Tab = "home" | "subscription" | "settings"

interface NavigationContextType {
  activeTab: Tab
  setActiveTab: (tab: Tab) => void
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined)

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<Tab>("home")
  return (
    <NavigationContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider")
  return ctx
}
