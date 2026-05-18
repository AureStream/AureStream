use std::sync::Arc;

use crate::adapter::CoreAdapter;

pub struct CoreManager {
    adapter: Arc<dyn CoreAdapter>,
}

impl CoreManager {
    pub fn new(adapter: Arc<dyn CoreAdapter>) -> Self {
        Self { adapter }
    }

    pub fn adapter(&self) -> &Arc<dyn CoreAdapter> {
        &self.adapter
    }
}
