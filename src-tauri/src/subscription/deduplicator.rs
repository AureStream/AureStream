use std::collections::HashMap;

use crate::models::Endpoint;

/// 按 `unique_hash` 保留首个节点。
pub fn dedup_endpoints(endpoints: Vec<Endpoint>) -> Vec<Endpoint> {
    let mut seen = HashMap::new();
    let mut out = Vec::new();
    for mut ep in endpoints {
        let h = if ep.unique_hash.is_empty() {
            ep.compute_unique_hash()
        } else {
            ep.unique_hash.clone()
        };
        ep.unique_hash = h.clone();
        if seen.insert(h, ()).is_none() {
            out.push(ep);
        }
    }
    out
}
