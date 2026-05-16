import {
  ArrowUpCircle,
  ArrowDownCircle,
  Activity,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useProxyStore } from "@/stores/appStore";
import { getLatencyColor } from "@/types";

export function StatusCard() {
  const { currentNode, isConnected, uploadSpeed, downloadSpeed } =
    useProxyStore();

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return `${(bytesPerSecond / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="glass rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Activity className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-base">连接状态</h3>
        <div className="ml-auto flex items-center gap-2">
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">已连接</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                未连接
              </span>
            </>
          )}
        </div>
      </div>

      {currentNode && (
        <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-black/5 dark:bg-white/5">
          <span className="text-sm text-muted-foreground">延迟</span>
          <span
            className={`text-2xl font-bold ${getLatencyColor(currentNode.delay)}`}
          >
            {currentNode.delay !== undefined ? `${currentNode.delay}ms` : "--"}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 pt-2">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5">
          <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <ArrowUpCircle className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              上传
            </div>
            <div className="text-sm font-semibold">
              {formatSpeed(uploadSpeed)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <ArrowDownCircle className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
              下载
            </div>
            <div className="text-sm font-semibold">
              {formatSpeed(downloadSpeed)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
