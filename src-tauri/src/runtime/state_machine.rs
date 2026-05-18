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

pub fn ensure_can_disconnect(current: ConnectionState) -> Result<(), AppError> {
    if current.can_disconnect() {
        Ok(())
    } else {
        Err(AppError::InvalidStateTransition {
            from: current.as_str().to_string(),
            to: ConnectionState::Disconnected.as_str().to_string(),
        })
    }
}

pub fn ensure_can_switch(current: ConnectionState) -> Result<(), AppError> {
    if current.can_switch() {
        Ok(())
    } else {
        Err(AppError::InvalidStateTransition {
            from: current.as_str().to_string(),
            to: ConnectionState::Switching.as_str().to_string(),
        })
    }
}
