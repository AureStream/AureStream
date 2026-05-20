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

      {/* 主按钮 — 始终是同一个 <button>，仅颜色/阴影随状态过渡 */}
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
          "relative z-10 flex flex-col items-center justify-center rounded-full transition-all duration-700 ease-in-out",
          "cursor-pointer",
          dims.outer,
          "backdrop-blur-2xl border group",
          isConnected && !isDisconnecting
            ? "border-cyan-500/30 bg-cyan-500/10 dark:bg-cyan-500/5 shadow-[0_0_50px_rgba(6,182,212,0.35),0_0_100px_rgba(59,130,246,0.15)]"
            : "border-slate-200/60 dark:border-neutral-800/60 bg-white/60 dark:bg-neutral-900/40 shadow-[0_8px_32px_rgba(0,0,0,0.04)] hover:border-primary/30 hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]",
          !isConnected && !isConnecting && "opacity-90 hover:opacity-100",
          busy && "border-primary/20",
        )}
      >
        {/* 连接中 / 断开中 — 旋转渐变环 */}
        {busy && (
          <svg
            className="absolute inset-0 size-full animate-spin"
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
            "relative z-10 flex shrink-0 flex-col items-center justify-center rounded-full transition-all duration-700 ease-in-out",
            dims.inner,
            isConnected && !isDisconnecting
              ? "bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 shadow-[inset_0_2px_4px_rgba(255,255,255,0.45),0_10px_25px_rgba(59,130,246,0.45)]"
              : busy
                ? "bg-gradient-to-tr from-indigo-600/70 via-blue-500/70 to-cyan-400/70"
                : "bg-gradient-to-tr from-slate-200/90 to-slate-50 dark:from-neutral-900 dark:to-neutral-850/90 shadow-[inset_0_2px_4px_rgba(255,255,255,0.15),0_4px_12px_rgba(0,0,0,0.05)] border border-slate-200/30 dark:border-neutral-800/30",
          )}
        >
          <Power
            className={cn(
              "relative z-10 shrink-0 transition-all duration-700 ease-in-out",
              dims.icon,
              isConnected && !isDisconnecting
                ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)] scale-105"
                : busy
                  ? "text-white/90"
                  : "text-slate-400 dark:text-slate-500 group-hover:text-primary dark:group-hover:text-primary-foreground group-hover:scale-105",
            )}
            strokeWidth={2}
          />
          <p
            className={cn(
              "max-w-[95%] text-center transition-all duration-700 ease-in-out",
              dims.captionInner,
              busy && "text-white/85",
              !busy && isConnected && "text-white/95 font-bold tracking-wide",
              !busy && !isConnected && "text-slate-500 dark:text-slate-400 group-hover:text-primary dark:group-hover:text-primary-foreground font-semibold",
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
            "pointer-events-none absolute inset-0 rounded-full border-2 border-primary/30 transition-opacity duration-700",
            isConnected && !isDisconnecting
              ? "animate-ping opacity-100"
              : "opacity-0",
          )}
          style={{ animationDuration: "1.5s" }}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full border border-primary/20 transition-opacity duration-700",
            isConnected && !isDisconnecting
              ? "animate-ping opacity-100"
              : "opacity-0",
          )}
          style={{ animationDuration: "3s", animationDelay: "0.5s" }}
        />
      </button>

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
