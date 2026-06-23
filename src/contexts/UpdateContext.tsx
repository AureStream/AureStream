import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import { check } from "@tauri-apps/plugin-updater"
import { relaunch } from "@tauri-apps/plugin-process"
import { ask, message } from "@tauri-apps/plugin-dialog"
import { invoke } from "@tauri-apps/api/core"

interface UpdateState {
  updateAvailable: boolean
  newVersion: string | null
  checking: boolean
  currentVersion: string
  triggerCheck: (silent?: boolean) => Promise<void>
  performUpdate: () => Promise<void>
}

const UpdateContext = createContext<UpdateState>({
  updateAvailable: false,
  newVersion: null,
  checking: false,
  currentVersion: "",
  triggerCheck: async () => {},
  performUpdate: async () => {},
})

export function useUpdate() {
  return useContext(UpdateContext)
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [newVersion, setNewVersion] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [currentVersion, setCurrentVersion] = useState("")
  const [updateObject, setUpdateObject] = useState<any>(null)

  // Fetch current version on mount
  useEffect(() => {
    invoke<string>("get_app_version")
      .then((ver) => setCurrentVersion(ver))
      .catch((err) => {
        console.error("Failed to get app version:", err)
        setCurrentVersion("0.3.1")
      })
  }, [])

  // Auto check for updates on startup
  useEffect(() => {
    const timer = setTimeout(() => {
      void triggerCheck(true)
    }, 5000)
    return () => clearTimeout(timer)
  }, [])

  const triggerCheck = async (silent = false) => {
    if (checking) return
    setChecking(true)
    try {
      const update = await check()
      if (update) {
        setUpdateAvailable(true)
        setNewVersion(update.version)
        setUpdateObject(update)
        if (!silent) {
          await message(`发现新版本 ${update.version}。`, {
            title: "发现新版本",
            kind: "info",
            okLabel: "确定",
          })
        }
      } else {
        setUpdateAvailable(false)
        setNewVersion(null)
        setUpdateObject(null)
        if (!silent) {
          await message("当前已是最新版本。", {
            title: "未发现更新",
            kind: "info",
            okLabel: "确定",
          })
        }
      }
    } catch (err) {
      console.error("Failed to check for updates:", err)
      if (!silent) {
        const errMsg = String(err)
        if (errMsg.includes("None of the fallback platforms") || errMsg.includes("were found in the response")) {
          await message("暂无匹配您当前系统架构的更新版本。", {
            title: "未发现可用更新",
            kind: "info",
            okLabel: "确定",
          })
        } else {
          await message(`检查更新失败: ${err}`, {
            title: "错误",
            kind: "error",
            okLabel: "确定",
          })
        }
      }
    } finally {
      setChecking(false)
    }
  }

  const performUpdate = async () => {
    let activeUpdate = updateObject
    if (!activeUpdate) {
      try {
        activeUpdate = await check()
      } catch (err) {
        const errMsg = String(err)
        if (errMsg.includes("None of the fallback platforms") || errMsg.includes("were found in the response")) {
          await message("暂无匹配您当前系统架构的更新包。", {
            title: "更新失败",
            kind: "warning",
            okLabel: "确定",
          })
        } else {
          await message(`获取更新包失败: ${err}`, {
            title: "更新失败",
            kind: "error",
            okLabel: "确定",
          })
        }
        return
      }
    }

    if (!activeUpdate) {
      await message("暂无可用的更新包。", {
        title: "更新失败",
        kind: "warning",
        okLabel: "确定",
      })
      return
    }

    try {
      const yes = await ask(
        `确定要更新至版本 ${activeUpdate.version} 吗？安装完成后应用将自动重启。`,
        {
          title: "确认更新",
          kind: "info",
          okLabel: "安装",
          cancelLabel: "取消",
        }
      )

      if (yes) {
        await activeUpdate.downloadAndInstall()
        await relaunch()
      }
    } catch (err) {
      console.error("Failed to install update:", err)
      await message(`安装更新失败: ${err}`, {
        title: "安装错误",
        kind: "error",
        okLabel: "确定",
      })
    }
  }

  return (
    <UpdateContext.Provider
      value={{
        updateAvailable,
        newVersion,
        checking,
        currentVersion,
        triggerCheck,
        performUpdate,
      }}
    >
      {children}
    </UpdateContext.Provider>
  )
}
