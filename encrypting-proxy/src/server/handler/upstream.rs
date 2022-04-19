use super::proxy_error::ProxyError;

#[cfg_attr(test, mockall::automock)]
pub(crate) trait Upstream {
    fn request(&self, body: &[u8]) -> Result<ureq::Response, ProxyError>;
}

pub(crate) struct Web3GatewayUpstream {
    pub(super) url: url::Url,
    agent: ureq::Agent,
}

impl Web3GatewayUpstream {
    pub(crate) fn new(url: url::Url) -> Self {
        Self {
            url,
            agent: ureq::AgentBuilder::new()
                .timeout(std::time::Duration::from_secs(30))
                .build(),
        }
    }
}

impl Upstream for Web3GatewayUpstream {
    fn request(&self, body: &[u8]) -> Result<ureq::Response, ProxyError> {
        self.agent
            .request_url("POST", &self.url)
            .send_bytes(body)
            .map_err(|e| match e {
                ureq::Error::Status(code, _) => ProxyError::ErrorResponse(code),
                ureq::Error::Transport(te) => match te.kind() {
                    ureq::ErrorKind::Io => ProxyError::Timeout,
                    _ => ProxyError::BadGateway(Box::new(ureq::Error::Transport(te))),
                },
            })
    }
}
