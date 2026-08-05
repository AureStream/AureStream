use std::fmt;

use serde::Deserialize;

const DEFAULT_ERROR_CODE: &str = "request_failed";

/// Typed API error returned by Worker endpoints.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApiError {
    pub code: String,
    pub status: u16,
    pub retry_after: Option<u32>,
}

impl ApiError {
    pub fn from_code(
        code: impl Into<String>,
        status: u16,
        retry_after: Option<u32>,
    ) -> Self {
        Self {
            code: code.into(),
            status,
            retry_after,
        }
    }

    pub(crate) async fn from_response(response: reqwest::Response) -> Self {
        let status = response.status().as_u16();
        let body = response
            .json::<ErrorBody>()
            .await
            .unwrap_or(ErrorBody {
                error: None,
                retry_after: None,
            });

        Self::from_code(
            body.error.unwrap_or_else(|| DEFAULT_ERROR_CODE.to_string()),
            status,
            body.retry_after,
        )
    }
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} (HTTP {})", self.code, self.status)
    }
}

impl std::error::Error for ApiError {}

#[derive(Debug, Deserialize)]
struct ErrorBody {
    error: Option<String>,
    retry_after: Option<u32>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_email_already_registered() {
        let err = ApiError::from_code("email_already_registered", 409, None);
        assert_eq!(err.code, "email_already_registered");
    }

    #[test]
    fn from_code_preserves_status_and_retry_after() {
        let err = ApiError::from_code("resend_too_soon", 429, Some(30));
        assert_eq!(err.status, 429);
        assert_eq!(err.retry_after, Some(30));
    }
}
