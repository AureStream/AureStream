import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Provider } from "@/types";

interface ProviderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    provider: Omit<Provider, "id" | "nodeCount" | "lastUpdated">,
  ) => void | Promise<void>;
  editingProvider?: Provider | null;
}

const AUTO_UPDATE_OPTIONS = [
  { label: "不自动更新", value: "" },
  { label: "每 30 分钟", value: "30" },
  { label: "每 1 小时", value: "60" },
  { label: "每 2 小时", value: "120" },
  { label: "每 6 小时", value: "360" },
  { label: "每 12 小时", value: "720" },
  { label: "每 24 小时", value: "1440" },
];

export function ProviderModal({
  open,
  onOpenChange,
  onSave,
  editingProvider,
}: ProviderModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [autoUpdateInterval, setAutoUpdateInterval] = useState<
    number | undefined
  >(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({});

  useEffect(() => {
    if (editingProvider) {
      setName(editingProvider.name);
      setUrl(editingProvider.url);
      setAutoUpdateInterval(editingProvider.autoUpdateInterval);
    } else {
      setName("");
      setUrl("");
      setAutoUpdateInterval(undefined);
    }
    setErrors({});
  }, [editingProvider, open]);

  const validateForm = (): boolean => {
    const newErrors: { name?: string; url?: string } = {};

    if (!name.trim()) {
      newErrors.name = "请输入服务商名称";
    }

    if (!url.trim()) {
      newErrors.url = "请输入订阅链接";
    } else if (!isValidUrl(url)) {
      newErrors.url = "请输入有效的 URL";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (urlString: string): boolean => {
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      await onSave({
        name: name.trim(),
        url: url.trim(),
        autoUpdateInterval,
      });

      onOpenChange(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-lg">
              {editingProvider ? "编辑服务商" : "添加服务商"}
            </DialogTitle>
            <DialogDescription>
              {editingProvider ? "修改服务商信息" : "添加新的订阅服务商"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                服务商名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：我的订阅"
                disabled={isLoading}
                className="h-10 rounded-xl animate-none focus:scale-100"
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="url">
                订阅链接 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/clash.yaml"
                disabled={isLoading}
                className="h-10 rounded-xl animate-none focus:scale-100"
              />
              {errors.url && (
                <p className="text-xs text-destructive">{errors.url}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="autoUpdate">定时更新</Label>
              <Select
                id="autoUpdate"
                value={autoUpdateInterval?.toString() ?? ""}
                onChange={(val) =>
                  setAutoUpdateInterval(
                    val ? Number(val) : undefined,
                  )
                }
                options={AUTO_UPDATE_OPTIONS}
                disabled={isLoading}
              />
            </div>
          </div>

          <DialogFooter>
            {!isLoading && (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-black/[0.04] dark:bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-black/[0.08] dark:hover:bg-white/[0.08] border border-black/5 dark:border-white/5 transition-all active:scale-[0.98]"
              >
                取消
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary to-indigo-600 text-white text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? "下载中..." : "保存"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
