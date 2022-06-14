use jsonrpsee_types as jrpc;

#[derive(Debug, thiserror::Error)]
pub(crate) enum Error {
    #[error("request timed out")]
    Timeout,

    #[error("encrypting proxy is being rate limited by the upstream")]
    RateLimited,

    #[error(transparent)]
    BadGateway(#[from] Box<ureq::Error>),

    #[error("request missing required params")]
    MissingParams,

    #[error(transparent)]
    InvalidParams(serde_json::Error),

    #[error("invalid hex data in request: {0}")]
    InvalidRequestData(#[source] hex::FromHexError),

    #[error("invalid hex data in upstream response: {0}")]
    InvalidResponseData(#[source] hex::FromHexError),

    #[error("the upstream gateway returned err status code {0}")]
    ErrorResponse(u16),

    #[error("invalid response from the upstream gateway: {0}")]
    UnexpectedRepsonse(#[source] serde_json::Error),

    #[error(
        "mismatched response ID returned by the upstream gateway. expected {expected:?} but got \
         {actual:?}"
    )]
    UnexpectedResponseId {
        expected: jrpc::Id<'static>,
        actual: jrpc::Id<'static>,
    },

    #[error("an unexpected error occured")]
    Internal,
}

impl Error {
    pub(super) fn into_rpc_error(self, req_id: jrpc::Id<'_>) -> jrpc::error::ErrorResponse<'_> {
        let code = match self {
            Self::Timeout | Self::RateLimited => jrpc::error::ErrorCode::ServerIsBusy,
            Self::MissingParams | Self::InvalidParams(_) | Self::InvalidRequestData(_) => {
                jrpc::error::ErrorCode::InvalidParams
            }
            Self::ErrorResponse(_) | Self::UnexpectedRepsonse(_) | Self::InvalidResponseData(_) => {
                jrpc::error::ErrorCode::InternalError
            }
            Self::BadGateway(_) => jrpc::error::ErrorCode::ServerError(-1),
            Self::Internal | Self::UnexpectedResponseId { .. } => {
                jrpc::error::ErrorCode::ServerError(-2)
            }
        };
        let message = format!("{}. {}", code.message(), self);
        jrpc::ErrorResponse::new(
            jrpc::error::ErrorObject {
                code,
                message: message.into(),
                data: None,
            },
            req_id,
        )
    }
}
