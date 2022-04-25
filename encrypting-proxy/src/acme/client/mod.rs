mod types;

use jsonwebkey::{self as jwk, JsonWebKey};
use jsonwebtoken as jwt;
use ureq::Agent;
use url::Url;

use super::Error;

use types::*;

pub(super) struct AcmeClientConnector {
    provider_url: Url,
    account_key: JsonWebKey,
    http_agent: Agent,
}

impl AcmeClientConnector {
    pub(super) fn new(provider_url: Url, account_key: JsonWebKey) -> Self {
        macro_rules! jwk_assert {
            ($predicate:expr) => {
                if cfg!(target_env = "sgx") {
                    // This is just to make sure that the key is being constructed correctly
                    // by this service. It cannot be provided externally.
                    debug_assert!($predicate)
                } else {
                    // Although the key is created by this service, it is stored and loaded
                    // from a file so it may have been modified to become invalid.
                    assert!($predicate)
                }
            };
        }
        jwk_assert!(!matches!(&*account_key.key, jwk::Key::Symmetric { .. }));
        jwk_assert!(account_key.algorithm.is_some());
        jwk_assert!(account_key.key_id.is_some());

        let http_agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(30))
            .build();

        Self {
            provider_url,
            account_key,
            http_agent,
        }
    }

    pub(super) fn connect(self) -> Result<AcmeClient, Error> {
        let directory: Directory = self
            .http_agent
            .request_url("GET", &self.provider_url.join("directory").unwrap())
            .call()?
            .into_json()?;

        let new_nonce_res = self
            .http_agent
            .request_url("POST", &directory.new_nonce)
            .call()?;
        let nonce = extract_nonce(&new_nonce_res)?;

        let signing_key_alg = self.account_key.algorithm.unwrap(); // checked in `new`
        let signing_key = self.account_key.key.to_encoding_key();

        let new_account_res = UnsignedRequest::new(
            JwsProtected {
                alg: signing_key_alg.name(),
                url: &directory.new_account,
                nonce,
                jwk_or_kid: JwkOrKid::Jwk(&self.account_key),
            },
            Payload::new_account(),
        )
        .sign(&signing_key, signing_key_alg)?
        .send(&self.http_agent)?;

        let account_key_id = new_account_res
            .header("location")
            .ok_or(Error::Protocol("new-account did not return a kid"))
            .and_then(|kid| {
                kid.parse()
                    .map_err(|_| Error::Protocol("new-account did not return a valid kid: {kid}"))
            })?;
        let nonce = extract_nonce(&new_account_res)?;

        Ok(AcmeClient {
            account_key_id,
            signing_key,
            signing_key_alg,
            nonce: nonce.into(),
            directory,
            http_agent: self.http_agent,
        })
    }
}

/// Implements an ACME client as described in
/// [draft-ietf-acme-acme-09](https://datatracker.ietf.org/doc/html/draft-ietf-acme-acme-09).
pub(super) struct AcmeClient {
    /// The account key id returned from `new-account` and used as the `kid` in subsequent calls.
    account_key_id: Url,
    http_agent: Agent,
    nonce: String,
    directory: Directory,
    /// A cache of the account key converted to PEM and reloaded by `jsonwebtoken`,
    /// a not-inexpensive operation.
    signing_key: jwt::EncodingKey,
    signing_key_alg: jwk::Algorithm,
}

impl AcmeClient {
    pub(super) fn order_certificate(&mut self) -> Result<Vec<u8>, Error> {
        todo!()
    }
}

fn extract_nonce(res: &ureq::Response) -> Result<&str, Error> {
    res.header("replay-nonce")
        .ok_or(Error::Protocol("failed to obtain replay-nonce"))
}
