use jsonwebkey::{self as jwk, JsonWebKey};
use jsonwebtoken as jwt;
use serde::{
    ser::{SerializeStruct, Serializer},
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

#[derive(Clone, Copy, Serialize)]
#[serde(untagged)]
pub(super) enum Payload {
    NewAccount(NewAccountPayload),
    NewOrder(bool),
}

impl Payload {
    pub(super) fn new_account() -> Self {
        Self::NewAccount(NewAccountPayload)
    }
}

#[derive(Clone, Copy)]
#[non_exhaustive]
pub(super) struct NewAccountPayload;

impl Serialize for NewAccountPayload {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let mut ss = s.serialize_struct("", 2)?;
        ss.serialize_field("termsOfServiceAgreed", &true)?;
        ss.serialize_field("contact", &("mailto:sep@oasislabs.com",))?;
        ss.end()
    }
}

#[derive(Debug, Serialize)]
pub(super) struct JwsProtected<'a> {
    pub(super) alg: &'a str,
    pub(super) url: &'a Url,
    pub(super) nonce: &'a str,
    #[serde(flatten)]
    pub(super) jwk_or_kid: JwkOrKid<'a>,
}

#[derive(Debug, Serialize)]
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
    payload: Payload,
}

impl<'a> UnsignedRequest<'a> {
    pub(super) fn new(protected: JwsProtected<'a>, payload: Payload) -> Self {
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
