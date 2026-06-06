const BOOT_SPLASH_EXIT_MS = 480

/** Fade out the static HTML boot splash (sibling of #root) and remove it from the DOM. */
export function dismissBootSplash(): Promise<void> {
  const el = document.getElementById("boot-splash")
  if (!el) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      el.remove()
      resolve()
    }

    el.classList.add("boot-splash-exit")
    el.addEventListener("transitionend", finish, { once: true })
    window.setTimeout(finish, BOOT_SPLASH_EXIT_MS + 80)
  })
}
