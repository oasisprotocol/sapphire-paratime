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
            Payload::NewAccount,
        )
        .sign(&signing_key, signing_key_alg)?
        .send(&self.http_agent)?;

        let nonce = extract_nonce(&new_account_res)?;
        let account_key_id = extract_location(&new_account_res, "new-account", "kid")?;

        Ok(AcmeClient {
            account_key_id,
            account_key_thumbprint: self.account_key.key.thumbprint(),
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
    account_key_thumbprint: String,
    http_agent: Agent,
    nonce: String,
    directory: Directory,
    /// A cache of the account key converted to PEM and reloaded by `jsonwebtoken`,
    /// a not-inexpensive operation.
    signing_key: jwt::EncodingKey,
    signing_key_alg: jwk::Algorithm,
}

impl AcmeClient {
    pub(super) fn order_certificate(mut self, domains: Vec<String>) -> Result<PendingOrder, Error> {
        let (new_order_res, nonce) =
            self.post(Payload::NewOrder { domains }, &self.directory.new_order)?;
        self.nonce = nonce;
        let order_url = extract_location(&new_order_res, "new-order", "order URL")?;

        let order_res: NewOrderResponse = new_order_res.into_json()?;
        Ok(PendingOrder {
            client: self,
            order_url,
            authorization_urls: order_res.authorization_urls,
            finalize_url: order_res.finalize_url,
        })
    }

    fn get<T: serde::de::DeserializeOwned>(&self, url: &Url) -> Result<T, Error> {
        let res = self.http_agent.request_url("GET", url).call()?;
        if res.status() >= 300 {
            return Err(ureq::Error::Status(res.status(), res).into());
        }
        Ok(res.into_json()?)
    }

    /// Returns the response and the nonce.
    fn post(&self, payload: Payload<'_>, url: &Url) -> Result<(ureq::Response, String), Error> {
        let res = UnsignedRequest::new(
            JwsProtected {
                alg: self.signing_key_alg.name(),
                url,
                nonce: &self.nonce,
                jwk_or_kid: JwkOrKid::Kid(&self.account_key_id),
            },
            payload,
        )
        .sign(&self.signing_key, self.signing_key_alg)?
        .send(&self.http_agent)?;
        let nonce = extract_nonce(&res)?.into();
        Ok((res, nonce))
    }
}

/// PendingOrder that the client must complete in order to be issued a cert.
pub(super) struct PendingOrder {
    client: AcmeClient,
    _order_url: Url,
    authorization_urls: Vec<Url>,
    finalize_url: Url,
}

impl PendingOrder {
    pub(super) fn challenges<'a>(
        &'a self,
    ) -> impl Iterator<Item = Result<Challenge<'a>, Error>> + 'a {
        self.authorization_urls.iter().map(|authz_url| {
            let authz_res: AuthorizationResponse = self.client.get(authz_url)?;
            let challenge = authz_res
                .challenges
                .into_iter()
                .find(|c| c.ty == "http-01")
                .ok_or(Error::NoHttp01Challenge)?;
            Ok(Challenge {
                client: &self.client,
                url: challenge.url,
                token: challenge.token,
            })
        })
    }

    /// Returns the TLS cert (in TODO format).
    pub(super) fn complete(self, csr: Vec<u8>) -> Result<Vec<u8>, Error> {
        todo!("POST to finalize url with CSR");
        Ok(vec![])
    }
}

/// An http-01 challenge. The token should be registered into the challenge responder server.
pub(super) struct Challenge<'a> {
    client: &'a AcmeClient,
    url: Url,
    token: String,
}

impl Challenge<'_> {
    pub(super) fn token(&self) -> String {
        self.token.clone()
    }

    pub(super) fn wait_for_validation(self) -> Result<(), Error> {
        self.client.post(
            Payload::ChallengeResponse {
                key_auth: &self.client.account_key_thumbprint,
            },
            &self.url,
        )?;
        loop {
            #[derive(serde::Deserialize)]
            struct ChallengeStatus {
                status: Status,
            }
            let ChallengeStatus { status } = self.client.get(&self.url)?;
            match status {
                Status::Invalid => return Err(Error::ChallengeFailed),
                Status::Valid => return Ok(()),
                _ => std::thread::sleep(std::time::Duration::from_secs(1)),
            }
        }
    }
}

fn extract_nonce(res: &ureq::Response) -> Result<&str, Error> {
    res.header("replay-nonce")
        .ok_or_else(|| Error::Protocol("failed to obtain replay-nonce".into()))
}

fn extract_location(
    res: &ureq::Response,
    endpoint: &'static str,
    item: &'static str,
) -> Result<url::Url, Error> {
    let loc = res
        .header("location")
        .ok_or_else(|| Error::Protocol(format!("{endpoint} did not return the expected {item}")))?;
    loc.parse()
        .map_err(|_| Error::Protocol(format!("{endpoint} did not return a valid {item}: {loc}")))
}
