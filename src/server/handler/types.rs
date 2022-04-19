use bumpalo::Bump;
use jsonrpsee_types as jrpc;
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;

// A replacement for [`jsonrpsee_types::RequestSer`], which requires owned params.
#[derive(Serialize)]
pub(super) struct Web3Request<'a> {
    pub(super) jsonrpc: jrpc::TwoPointZero,
    pub(super) id: &'a jrpc::Id<'a>,
    pub(super) method: &'a str,
    pub(super) params: Web3RequestParams<'a>,
}

#[derive(Serialize)]
#[serde(untagged)]
pub(super) enum Web3RequestParams<'a> {
    SendRawTx(#[serde(borrow)] EthSendRawTxParams<'a>),
    Call(#[serde(borrow)] EthCallParams<'a>),
}

pub(super) type EthSendRawTxParams<'a> = (&'a str,);
pub(super) type EthCallParams<'a> = (EthTx<'a>, Option<&'a RawValue>);

#[derive(Serialize, Deserialize)]
pub(super) struct EthTx<'a> {
    #[serde(borrow)]
    pub(super) from: Option<&'a RawValue>,
    #[serde(borrow)]
    pub(super) to: Option<&'a RawValue>,
    #[serde(borrow)]
    pub(super) gas: Option<&'a RawValue>,
    #[serde(borrow)]
    pub(super) gas_price: Option<&'a RawValue>,
    #[serde(borrow)]
    pub(super) value: Option<&'a RawValue>,
    #[serde(borrow)]
    pub(super) data: Option<&'a str>,
}

pub(crate) type HandlerResult<'a> =
    Result<jrpc::Response<'a, Web3ResponseParams<'a>>, jrpc::ErrorResponse<'a>>;

#[cfg_attr(test, derive(Debug))]
pub(crate) enum Web3ResponseParams<'a> {
    RawValue(&'a RawValue),
    CallResult(Vec<u8, &'a Bump>), // `String::from_utf8` requires the vec be in the global allocator
}

impl serde::Serialize for Web3ResponseParams<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::RawValue(rv) => rv.serialize(serializer),
            Self::CallResult(hex_bytes) => {
                let hex_str = from_utf8(hex_bytes);
                hex_str.serialize(serializer)
            }
        }
    }
}

pub(super) fn from_utf8(bytes: &'_ [u8]) -> &'_ str {
    if cfg!(debug_assertions) {
        #[allow(clippy::expect_used)]
        std::str::from_utf8(bytes).expect("re-encoded call result was not hex")
    } else {
        unsafe { std::str::from_utf8_unchecked(bytes) }
    }
}
