use crate::error::AppError;
use crate::models::ConnectionState;

pub fn ensure_can_connect(current: ConnectionState) -> Result<(), AppError> {
    if current.can_connect() {
        Ok(())
    } else {
        Err(AppError::InvalidStateTransition {
            from: current.as_str().to_string(),
            to: ConnectionState::Connecting.as_str().to_string(),
        })
    }
}
