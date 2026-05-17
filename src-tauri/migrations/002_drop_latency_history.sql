-- 测速结果不再入库；若曾运行过含 latency_history 的旧版 001，此处删除遗留表与索引。
DROP INDEX IF EXISTS idx_latency_node;
DROP TABLE IF EXISTS latency_history;
