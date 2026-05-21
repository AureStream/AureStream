import { Power, Zap } from "lucide-react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { useProxyStore } from "@/stores/appStore";
import { toast } from "sonner";
import { logErrorDetail, userFacingMessage } from "@/lib/userErrors";

const SIZE_MAP = {
  sm: {
    glow: "w-[7.5rem] h-[7.5rem]",
    outer: "w-[7.5rem] aspect-square",
    inner: "w-[5rem] aspect-square gap-0.5 p-1",
    icon: "w-6 h-6",
    captionInner: "text-[9px] font-semibold leading-tight",
  },
  default: {
    glow: "w-[10.25rem] h-[10.25rem]",
    outer: "w-[10.25rem] aspect-square",
    inner: "w-[6.5rem] aspect-square gap-1 p-1.5",
    icon: "w-9 h-9",
    captionInner: "text-[10px] sm:text-[11px] font-semibold leading-tight",
  },
  lg: {
    glow: "w-[13.5rem] h-[13.5rem]",
    outer: "w-[13.5rem] aspect-square",
    inner: "w-[9rem] aspect-square gap-1 p-2",
    icon: "w-11 h-11",
    captionInner: "text-xs sm:text-sm font-semibold leading-tight",
  },
} as const;

interface ConnectButtonProps {
  disabled?: boolean;
  size?: keyof typeof SIZE_MAP;
  className?: string;
  proxyMode?: "规则" | "全局" | "直连";
}

export function ConnectButton({
  disabled: disabledOuter = false,
  size = "default",
  className,
  proxyMode,
}: ConnectButtonProps) {
  const { isConnected, isConnecting, isDisconnecting, connect, disconnect } =
    useProxyStore();
  const spinGradId = useId().replace(/:/g, "i");
  const dims = SIZE_MAP[size];
  const busy = isConnecting || isDisconnecting;

  const handleClick = async () => {
    if (isConnected) {
      if (busy) return;
      try {
        await disconnect();
      } catch (e) {
        logErrorDetail("ConnectButton.disconnect", e);
        toast.error(userFacingMessage("disconnect"));
      }
      return;
    }
    if (disabledOuter || isConnecting) return;
    try {
      await connect();
    } catch (e) {
      logErrorDetail("ConnectButton.connect", e);
      toast.error(userFacingMessage("connect"));
    }
  };

  const diskState: "idle" | "active" | "busy" = busy
    ? "busy"
    : isConnected && !isDisconnecting
      ? "active"
      : "idle";

  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-3 sm:gap-4",
        className,
      )}
    >
      {/* 呼吸光晕 — 同一元素，仅切换动画类名 */}
      <div
        className={cn(
          "absolute rounded-full transition-all duration-1000 ease-in-out blur-3xl",
          dims.glow,
          isConnected && !isDisconnecting
            ? "bg-gradient-to-r from-cyan-500/40 via-blue-500/40 to-indigo-500/40 animate-breathing-active"
            : "bg-slate-400/20 dark:bg-slate-800/30 animate-breathing-idle",
        )}
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />

      <div className="connect-orb-root">
        {/* 主按钮 — WKWebView 亮色见 index.css `.connect-orb-btn` */}
        <button
          type="button"
          onClick={handleClick}
          disabled={
            !isConnected && (disabledOuter || isConnecting)
          }
          aria-disabled={
            !isConnected && (disabledOuter || isConnecting)
          }
          title={disabledOuter && !isConnected ? "请先选择服务商" : undefined}
          className={cn(
            "connect-orb-btn relative z-10 flex flex-col items-center justify-center rounded-full overflow-hidden transition-all duration-700 ease-in-out",
            "cursor-pointer",
            dims.outer,
            "border group",
            isConnected && !isDisconnecting
              ? "border-cyan-500/30 dark:border-cyan-400/35 shadow-[0_0_50px_rgba(6,182,212,0.25),0_0_100px_rgba(59,130,246,0.1)]"
              : "border-slate-200/40 dark:border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.02)] hover:border-primary/45 dark:hover:border-primary/40 hover:shadow-[0_0_30px_rgba(59,130,246,0.12)] dark:hover:shadow-[0_0_30px_rgba(99,102,241,0.2)]",
            !isConnected && !isConnecting && "opacity-95 hover:opacity-100",
            busy && "border-primary/20",
          )}
        >
          {busy && (
            <svg
              className="absolute inset-0 z-[2] size-full animate-spin"
              viewBox="0 0 124 124"
            >
            <circle
              cx="62"
              cy="62"
              r="58"
              fill="none"
              stroke={`url(#spin-grad-${spinGradId})`}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="260 120"
            />
            <defs>
              <linearGradient
                id={`spin-grad-${spinGradId}`}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="var(--color-primary)" />
                <stop offset="100%" stopColor="transparent" />
              </linearGradient>
            </defs>
          </svg>
        )}

          <div
            className={cn(
              "connect-orb-disk relative z-[3] flex shrink-0 flex-col items-center justify-center rounded-full transition-all duration-700 ease-in-out",
              dims.inner,
              diskState === "idle" &&
                "dark:border dark:border-zinc-700/35 dark:bg-gradient-to-b dark:from-zinc-800/85 dark:to-zinc-950 dark:shadow-[0_4px_16px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)]",
              diskState === "active" &&
                "dark:bg-gradient-to-tr dark:from-indigo-600 dark:via-blue-500 dark:to-cyan-400 dark:shadow-[inset_0_2px_4px_rgba(255,255,255,0.45),0_10px_25px_rgba(59,130,246,0.45)] text-white",
              diskState === "busy" &&
                "text-white/90 dark:bg-gradient-to-tr dark:from-indigo-600/70 dark:via-blue-500/70 dark:to-cyan-400/70 dark:text-white/90",
            )}
            data-connect-orb={diskState}
          >
          <Power
            className={cn(
              "relative z-10 shrink-0 transition-all duration-700 ease-in-out",
              dims.icon,
              isConnected && !isDisconnecting
                ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)] scale-105"
                : busy
                  ? "text-white/90"
                  : "text-slate-400 dark:text-zinc-500 group-hover:text-primary dark:group-hover:text-cyan-400 group-hover:scale-105",
            )}
            strokeWidth={2}
          />
          <p
            className={cn(
              "max-w-[95%] text-center transition-all duration-700 ease-in-out",
              dims.captionInner,
              busy && "text-white/85",
              !busy && isConnected && "text-white/95 font-bold tracking-wide",
              !busy && !isConnected && "text-slate-500 dark:text-zinc-400 group-hover:text-primary dark:group-hover:text-cyan-400 font-semibold",
            )}
          >
            {isDisconnecting
              ? "断开中"
              : isConnecting
                ? "连接中"
                : isConnected
                  ? "已连接"
                  : "未连接"}
          </p>
        </div>

        {/* 已连接 — 外层脉动波纹 */}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-[1] rounded-full border-2 border-primary/30 transition-opacity duration-700",
            isConnected && !isDisconnecting
              ? "animate-ping opacity-100"
              : "opacity-0",
          )}
          style={{ animationDuration: "1.5s" }}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-0 z-[1] rounded-full border border-primary/20 transition-opacity duration-700",
            isConnected && !isDisconnecting
              ? "animate-ping opacity-100"
              : "opacity-0",
          )}
          style={{ animationDuration: "3s", animationDelay: "0.5s" }}
        />
        </button>
      </div>

      {/* 代理模式说明（已连接时显示） */}
      <div className="flex min-h-[1.25rem] flex-col items-center justify-center text-center">
        <div
          className={cn(
            "flex h-[1.25rem] items-center justify-center gap-1.5 text-[11px] transition-opacity duration-700 ease-in-out",
            isConnected && !isDisconnecting
              ? "opacity-100"
              : "pointer-events-none select-none opacity-0",
          )}
          aria-hidden={!isConnected || isDisconnecting}
        >
          <Zap className="size-3 text-primary" aria-hidden />
          <span className="font-medium text-primary">
            {proxyMode === "全局"
              ? "全局模式已开启"
              : proxyMode === "直连"
                ? "直连模式已开启"
                : "规则模式已开启"}
          </span>
        </div>
      </div>
    </div>
  );
}
