use jsonwebkey::{self as jwk, JsonWebKey};
use jsonwebtoken as jwt;
use serde::{
    ser::{SerializeStruct, Serializer},
    Deserialize, Serialize,
};
use ureq::Agent;
use url::Url;

use super::Error;

pub(super) struct AcmeClient {
    account_key: JsonWebKey,
    http_agent: Agent,
    nonce: String,
    directory: Directory,
    /// A cache of `account_key.key.to_encoding_key()` since it's not a cheap operation.
    signing_key: jwt::EncodingKey,
}

impl AcmeClient {
    pub(super) fn connect(provider_url: Url, account_key: JsonWebKey) -> Result<Self, Error> {
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

        let directory: Directory = http_agent
            .request_url("GET", &provider_url.join("directory").unwrap())
            .call()?
            .into_json()?;

        Ok(Self {
            signing_key: account_key.key.to_encoding_key(),
            account_key,
            http_agent,
            nonce: String::new(),
            directory,
        })
    }

    pub(super) fn order_certificate(&mut self) -> Result<Vec<u8>, Error> {
        self.bootstrap_nonce()?;
        self.get_or_create_account()?;
        todo!()
    }

    fn bootstrap_nonce(&mut self) -> Result<(), Error> {
        let nonce_res = self
            .http_agent
            .request_url("POST", &self.directory.new_nonce)
            .call()?;
        self.nonce = extract_nonce(&nonce_res)?.into();
        Ok(())
    }

    fn get_or_create_account(&mut self) -> Result<String, Error> {
        let new_account_res = self.request(&AcmeRequest::NewAccount(NewAccountRequest))?;
        todo!()
    }

    fn request(&mut self, payload: &AcmeRequest) -> Result<ureq::Response, Error> {
        let url = match &payload {
            AcmeRequest::NewAccount(_) => &self.directory.new_account,
            AcmeRequest::NewOrder(_) => &self.directory.new_order,
        };

        let alg = self.account_key.algorithm.unwrap(); // checked in `new`

        let protected = base64json(&JwsProtected {
            alg: alg.name(),
            url,
            nonce: &self.nonce,
            jwk_or_kid: if matches!(payload, AcmeRequest::NewAccount(_)) {
                JwkOrKid::Kid(self.account_key.key_id.as_ref().unwrap()) // key_id checked in `new`
            } else {
                JwkOrKid::Jwk(&self.account_key)
            },
        });

        let payload = base64json(payload);

        let signed_message = format!("{protected}.{payload}");
        let signature =
            jwt::crypto::sign(signed_message.as_bytes(), &self.signing_key, alg.into())?;

        #[derive(Serialize)]
        struct Request {
            protected: String,
            payload: String,
            signature: String,
        }
        let res = self
            .http_agent
            .request_url("POST", url)
            .send_json(Request {
                protected,
                payload,
                signature,
            })?;
        if res.status() >= 300 {
            return Err(ureq::Error::Status(res.status(), res).into());
        }
        self.nonce = extract_nonce(&res)?.into();
        Ok(res)
    }
}

// The ACME directory response obtained by querying the directory URL.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Directory {
    new_account: Url,
    new_nonce: Url,
    new_order: Url,
}

fn extract_nonce(res: &ureq::Response) -> Result<&str, Error> {
    res.header("replay-nonce")
        .ok_or(Error::Protocol("failed to obtain replay-nonce"))
}

#[derive(Serialize)]
#[serde(untagged)]
enum AcmeRequest {
    NewAccount(NewAccountRequest),
    NewOrder(bool),
}

struct NewAccountRequest;

impl Serialize for NewAccountRequest {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut ss = s.serialize_struct("NewAccountRequest", 2)?;
        ss.serialize_field("termsOfServiceAgreed", &true)?;
        ss.serialize_field("contact", &("mailto:sep@oasislabs.com",))?;
        ss.end()
    }
}

#[derive(Debug, Serialize)]
struct JwsProtected<'a> {
    alg: &'a str,
    url: &'a Url,
    nonce: &'a str,
    #[serde(flatten)]
    jwk_or_kid: JwkOrKid<'a>,
}

#[derive(Debug, Serialize)]
enum JwkOrKid<'a> {
    Jwk(#[serde(serialize_with = "serialize_public_jwk")] &'a JsonWebKey),
    Kid(&'a str),
}

fn serialize_public_jwk<S: Serializer>(jwk: &JsonWebKey, s: S) -> Result<S::Ok, S::Error> {
    if !jwk.key.is_private() {
        jwk.serialize(s)
    } else {
        JsonWebKey {
            key: Box::new(jwk.key.to_public().expect("key is not hs256").into_owned()),
            ..jwk.clone()
        }
        .serialize(s)
    }
}

fn base64json<T: Serialize>(t: &T) -> String {
    let config = base64::Config::new(base64::CharacterSet::UrlSafe, false /* pad */);
    let json = serde_json::to_string(t).unwrap();
    if json == "\"\"" {
        return json; //The empty string is special-cased as itself.
    }
    base64::encode_config(json.as_bytes(), config)
}
