/**
 * 用户友好的错误处理和消息映射
 */

/**
 * 记录错误详情到控制台，便于调试
 */
export function logErrorDetail(context: string, error: unknown): void {
  console.error(`[${context}]`, error);
}

/**
 * 根据错误类型返回用户友好的错误消息
 */
export function userFacingMessage(errorType: string): string {
  const messages: Record<string, string> = {
    // 连接相关错误
    connect: "连接失败，请检查网络设置或稍后重试",
    disconnect: "断开连接时出现错误",

    // 订阅相关错误
    subscription: "订阅更新失败，请检查订阅链接是否有效",
    subscription_download: "下载订阅失败，请检查网络连接或订阅链接",

    // 默认错误消息
    default: "操作失败，请稍后重试"
  };

  return messages[errorType] || messages.default;
}