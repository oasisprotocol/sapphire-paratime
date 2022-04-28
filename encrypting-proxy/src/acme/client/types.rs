use jsonwebkey::{self as jwk, JsonWebKey};
use jsonwebtoken as jwt;
use serde::{
    ser::{SerializeSeq, SerializeStruct, Serializer},
    Deserialize, Serialize,
};
use url::Url;

use super::Error;

// The ACME directory response obtained by querying the directory URL.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Directory {
    pub(super) new_account: Url,
    pub(super) new_nonce: Url,
    pub(super) new_order: Url,
}

pub(super) enum Payload<'a> {
    NewAccount,
    NewOrder { domains: Vec<String> },
    ChallengeResponse { key_auth: &'a str },
}

impl Serialize for Payload<'_> {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::NewAccount => {
                let mut ss = s.serialize_struct("", 2)?;
                ss.serialize_field("termsOfServiceAgreed", &true)?;
                ss.serialize_field("contact", &("mailto:sep@oasislabs.com",))?;
                ss.end()
            }
            Self::NewOrder { domains } => {
                let mut ss = s.serialize_seq(Some(domains.len()))?;
                for domain in domains.into_iter() {
                    ss.serialize_element(&serde_json::json!({ "type": "dns", "value": domain }))?;
                }
                ss.end()
            }
            Self::ChallengeResponse { key_auth } => {
                let mut ss = s.serialize_struct("", 1)?;
                ss.serialize_field("keyAuthorization", key_auth)?;
                ss.end()
            }
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct JwsProtected<'a> {
    pub(super) alg: &'a str,
    pub(super) url: &'a Url,
    pub(super) nonce: &'a str,
    #[serde(flatten)]
    pub(super) jwk_or_kid: JwkOrKid<'a>,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub(super) enum JwkOrKid<'a> {
    Jwk(#[serde(serialize_with = "serialize_public_jwk")] &'a JsonWebKey),
    Kid(&'a Url),
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

pub(super) struct UnsignedRequest<'a> {
    protected: JwsProtected<'a>,
    payload: Payload<'a>,
}

impl<'a> UnsignedRequest<'a> {
    pub(super) fn new(protected: JwsProtected<'a>, payload: Payload<'a>) -> Self {
        Self { protected, payload }
    }

    pub(super) fn sign(
        self,
        signing_key: &jwt::EncodingKey,
        signing_key_alg: jwk::Algorithm,
    ) -> Result<Request<'a>, Error> {
        let protected = base64json(&self.protected);
        let payload = base64json(&self.payload);
        let signed_message = format!("{protected}.{payload}");
        let signature = jwt::crypto::sign(
            signed_message.as_bytes(),
            signing_key,
            signing_key_alg.into(),
        )?;
        Ok(Request {
            url: self.protected.url,
            protected,
            payload,
            signature,
        })
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Request<'a> {
    #[serde(skip)]
    url: &'a Url,
    protected: String,
    payload: String,
    signature: String,
}

impl Request<'_> {
    pub(super) fn send(self, http_agent: &ureq::Agent) -> Result<ureq::Response, Error> {
        let res = http_agent.request_url("POST", self.url).send_json(self)?;
        if res.status() >= 300 {
            return Err(ureq::Error::Status(res.status(), res).into());
        }
        Ok(res)
    }
}

/// @see https://datatracker.ietf.org/doc/html/draft-ietf-acme-acme-09#section-7.4
#[derive(Deserialize)]
pub(super) struct NewOrderResponse {
    #[serde(rename = "authorizations")]
    pub(super) authorization_urls: Vec<Url>,
    #[serde(rename = "finalize")]
    pub(super) finalize_url: Url,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct StatusOnly {
    pub(super) status: Status,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AuthorizationResponse {
    pub(super) status: Status,
    pub(super) challenges: Vec<Challenge>,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
pub(super) enum Status {
    Pending,
    Processing,
    Valid,
    Invalid,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Challenge {
    #[serde(rename = "type")]
    pub(super) ty: String, // http-01 is the one we care about
    pub(super) url: Url,
    pub(super) token: String,
}
