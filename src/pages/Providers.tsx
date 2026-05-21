import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ProviderCard } from "@/components/provider/ProviderCard";
import { ProviderModal } from "@/components/provider/ProviderModal";
import { logErrorDetail, userFacingMessage } from "@/lib/userErrors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PageShell } from "@/components/layout/PageShell";
import { useProxyStore } from "@/stores/appStore";
import type { Provider } from "@/types";

export function Providers() {
  const {
    providers,
    addProvider,
    updateProvider,
    deleteProvider,
    currentProvider,
    setCurrentSubscription,
    fetchAndSaveSubscription,
    refreshingIds,
  } = useProxyStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const deleteTarget = deleteTargetId
    ? providers.find((p) => p.id === deleteTargetId)
    : undefined;

  const handleSave = async (
    providerData: Omit<Provider, "id" | "nodeCount" | "lastUpdated">,
  ) => {
    const id = editingProvider?.id || crypto.randomUUID();
    const lastUpdated = new Date().toISOString();

    try {
      if (editingProvider) {
        await updateProvider(editingProvider.id, {
          ...editingProvider,
          ...providerData,
        });
        toast.success(`「${providerData.name}」已更新`);
      } else {
        const newProvider: Provider = {
          ...providerData,
          id,
          nodeCount: 0,
          lastUpdated,
        };
        // 先写入配置并 upsert subscriptions，再下载节点，避免 endpoints 外键失败
        await addProvider(newProvider);
        const result = await fetchAndSaveSubscription(id);
        if (result.success) {
          toast.success(`「${providerData.name}」订阅添加成功`);
        } else {
          // 订阅下载失败则回滚，不允许添加无效服务商
          await deleteProvider(id);
          toast.error(`「${providerData.name}」添加失败`, {
            description: "订阅下载失败，请检查链接是否正确",
          });
        }
      }
    } catch (e) {
      logErrorDetail("Providers.handleSave.download", e);
      toast.error(userFacingMessage("subscription_download"));
    }

    setEditingProvider(null);
  };

  const handleModalOpenChange = (open: boolean) => {
    setIsModalOpen(open);
  };

  const handleEdit = (provider: Provider) => {
    setEditingProvider(provider);
    setIsModalOpen(true);
  };

  const handleDeleteRequest = (id: string) => {
    setDeleteTargetId(id);
  };

  const handleConfirmDelete = () => {
    if (deleteTargetId) {
      deleteProvider(deleteTargetId);
    }
    setDeleteTargetId(null);
  };

  const handleRefresh = async (id: string) => {
    const name = providers.find((p) => p.id === id)?.name ?? "未知";
    const result = await fetchAndSaveSubscription(id);
    if (result.success) {
      toast.success(`「${name}」订阅已更新`);
    } else {
      toast.error(`「${name}」订阅更新失败`, {
        description: userFacingMessage("subscription"),
      });
    }
  };

  const handleSetActive = (provider: Provider) => {
    setCurrentSubscription(provider);
  };

  const handleAddNew = () => {
    setEditingProvider(null);
    setIsModalOpen(true);
  };

  return (
    <PageShell title="服务商管理" className="max-w-6xl">
      <div className="space-y-4 sm:space-y-5 lg:space-y-6">
        {/* Providers grid：有无数据均使用同一套网格与虚线「添加」卡片，PC 端视觉统一 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              isActive={currentProvider?.id === provider.id}
              isRefreshing={refreshingIds.has(provider.id)}
              onSetActive={handleSetActive}
              onEdit={handleEdit}
              onDelete={handleDeleteRequest}
              onRefresh={handleRefresh}
            />
          ))}
          <button
            type="button"
            onClick={handleAddNew}
            className="glass rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-[var(--shadow-glass-hover)] border-2 border-dashed border-border/50 hover:border-primary/40 flex flex-col items-center justify-center gap-2 min-h-[12rem] text-muted-foreground hover:text-primary"
          >
            <div className="w-10 h-10 rounded-xl bg-muted/30 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium">添加服务商</span>
            <span className="text-[11px] text-muted-foreground/60">
              粘贴订阅链接开始使用
            </span>
          </button>
        </div>

        <ProviderModal
          open={isModalOpen}
          onOpenChange={handleModalOpenChange}
          onSave={handleSave}
          editingProvider={editingProvider}
        />

        <AlertDialog
          open={deleteTargetId !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTargetId(null);
          }}
        >
          <AlertDialogContent className="sm:max-w-[440px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg">
                删除服务商
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget
                  ? `确定要删除「${deleteTarget.name}」吗？相关的订阅配置文件也会被删除。`
                  : "确定要删除这个服务商吗？相关的订阅配置文件也会被删除。"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteTargetId(null)} className="flex-1">
                取消
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmDelete} className="flex-1">
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </PageShell>
  );
}
