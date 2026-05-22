use tokio::sync::Mutex;

use crate::models::RuntimeSession;

#[allow(dead_code)]
#[derive(Default)]
pub struct SessionManager {
    current: Mutex<Option<RuntimeSession>>,
}

#[allow(dead_code)]
impl SessionManager {
    pub async fn replace(&self, session: RuntimeSession) {
        *self.current.lock().await = Some(session);
    }

    pub async fn clear(&self) {
        *self.current.lock().await = None;
    }

    pub async fn current(&self) -> Option<RuntimeSession> {
        self.current.lock().await.clone()
    }
}
