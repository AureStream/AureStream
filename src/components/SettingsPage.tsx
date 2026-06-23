import AppearanceSection from "./settings/AppearanceSection"
import NetworkSection from "./settings/NetworkSection"
import VersionSection from "./settings/VersionSection"
import HelperServiceSection from "./settings/HelperServiceSection"

export default function SettingsPage() {
  return (
    <div className="relative grid grid-cols-2 w-full h-full max-w-[1200px] mx-auto animate-fade-in p-6 gap-5 overflow-hidden">
      <div className="flex flex-col gap-5 min-h-0 h-full">
        <AppearanceSection />
        <VersionSection />
      </div>
      <div className="flex flex-col gap-5 min-h-0 h-full">
        <HelperServiceSection />
        <NetworkSection />
      </div>
    </div>
  )
}
