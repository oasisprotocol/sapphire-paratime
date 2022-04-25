use ureq::Agent;
use url::Url;

use super::Error;

pub(super) struct AcmeClient {
    http_agent: Agent,
    provider_url: Url,
    nonce: String,
}

impl AcmeClient {
    pub(super) fn new(provider_url: Url) -> Self {
        let http_agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(30))
            .build();

        Self {
            http_agent,
            provider_url,
            nonce: String::new(),
        }
    }

    pub(super) fn order_certificate(&mut self) -> Result<Vec<u8>, Error> {
        self.bootstrap_nonce()?;
        todo!()
    }

    fn bootstrap_nonce(&mut self) -> Result<(), Error> {
        let nonce_res = self
            .http_agent
            .request_url("POST", &self.ep("new-nonce"))
            .call()?;
        self.nonce = extract_nonce(&nonce_res)?.into();
        Ok(())
    }

    fn ep(&self, path: &'static str) -> url::Url {
        self.provider_url.join(path).unwrap()
    }
}

fn extract_nonce(res: &ureq::Response) -> Result<&str, Error> {
    res.header("replay-nonce")
        .ok_or(Error::Protocol("failed to obtain replay-nonce"))
}
