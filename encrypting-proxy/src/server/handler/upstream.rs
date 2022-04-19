use super::error::Error;

#[cfg_attr(any(test, fuzzing), mockall::automock)]
pub(crate) trait Upstream {
    fn request(&self, body: &[u8]) -> Result<ureq::Response, Error>;
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
    fn request(&self, body: &[u8]) -> Result<ureq::Response, Error> {
        self.agent
            .request_url("POST", &self.url)
            .send_bytes(body)
            .map_err(|e| match e {
                ureq::Error::Status(code, _) => Error::ErrorResponse(code),
                ureq::Error::Transport(te) => match te.kind() {
                    ureq::ErrorKind::Io => Error::Timeout,
                    _ => Error::BadGateway(Box::new(ureq::Error::Transport(te))),
                },
            })
    }
}
