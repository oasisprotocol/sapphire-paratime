use super::*;

macro_rules! rpc_json {
    ($method:literal, $params:tt) => {
        json!({
            "jsonrpc": "2.0",
            "id": "123",
            "method": $method,
            "params": $params,
        })
    }
}

macro_rules! err_checker {
    ($expected_err_code:expr) => {
        move |res: HandlerResult<'_>| {
            let err = res.unwrap_err().error;
            assert_eq!(err.code, $expected_err_code, "{}", err.message);
        }
    };
}

#[test]
fn req_no_content_len() {
    let mut server = TestServer::new();
    server.request(
        test_req("jsonrpc").with_header(
            tiny_http::Header::from_bytes("content-length".as_bytes(), "".as_bytes()).unwrap(),
        ),
        err_checker!(ErrorCode::InternalError),
    );
}

#[test]
fn req_malformed_jsonrpc() {
    let mut server = TestServer::new();
    server.request(test_req("{}"), err_checker!(ErrorCode::ParseError));
}

#[test]
fn req_oversized() {
    let mut server = TestServer::new();
    let body: String = "1".repeat(MAX_REQUEST_SIZE_BYTES + 1);
    server.request(test_req(&body), err_checker!(ErrorCode::OversizedRequest));
    server.request(
        test_req(&body).with_header(
            tiny_http::Header::from_bytes("content-length".as_bytes(), "1".as_bytes()).unwrap(),
        ),
        err_checker!(ErrorCode::ParseError),
    );
}

#[test]
fn req_send_transaction_unsupported() {
    let mut server = TestServer::new();
    server.request(
        test_req(rpc_json!("eth_sendTransaction", "{}")),
        err_checker!(ErrorCode::MethodNotFound),
    );
}

macro_rules! assert_invalid_params {
    ($server:ident, $method:literal, $params:tt) => {
        $server.request(
            test_req(rpc_json!($method, $params)),
            err_checker!(ErrorCode::InvalidParams),
        )
    };
}

#[test]
fn req_invalid_params() {
    let mut server = TestServer::new();
    assert_invalid_params!(server, "eth_sendRawTransaction", "0x1234");
    assert_invalid_params!(server, "eth_call", ["{\"data\": \"0\"}"]);
}

#[test]
fn req_invalid_data() {
    let mut server = TestServer::new();
    assert_invalid_params!(server, "eth_sendRawTransaction", ["0x1"]);
    assert_invalid_params!(server, "eth_sendRawTransaction", ["0xgg"]);
    assert_invalid_params!(server, "eth_call", ["{\"data\": \"0x123\"}", "latest"]);
}

#[test]
fn res_ratelimit_response() {
    let call = "eth_getCode";
    let req_body = web3_req!(jrpc::Id::Str("bad-json".into()), call, ["0xwherever"]);

    let mut upstream = MockUpstream::new();
    upstream.expect_request().returning(move |_| {
        Ok(ureq::Response::new(429, "Too Many Requests", "cloudflare says shoo!").unwrap())
    });

    let mut server = TestServer::with_upstream(upstream);
    server.request(test_req(req_body), err_checker!(ErrorCode::ServerIsBusy));
}

#[test]
fn res_unexpected_response() {
    let call = "eth_getCode";
    let req_body = web3_req!(jrpc::Id::Str("bad-json".into()), call, ["0xwherever"]);

    let mut upstream = MockUpstream::new();
    upstream
        .expect_request()
        .returning(move |_| Ok(ureq::Response::new(503, "Service Unavilable", "").unwrap()));

    let mut server = TestServer::with_upstream(upstream);
    server.request(test_req(req_body), err_checker!(ErrorCode::InternalError));
}

#[test]
fn res_tampering_gateway() {
    let req_id = jrpc::Id::Str("tampering-gateway".into());
    let res_id = req_id.clone();

    let call = "eth_call";
    let req_body = web3_req!(req_id, call, [json!({ "data": "0x00" }), "pending"]);

    let mut upstream = MockUpstream::new();
    upstream
        .expect_request()
        .returning(move |_| Ok(res(res_id.clone(), "0x66" /* wrong "encryption" */)));

    let mut server = TestServer::with_upstream(upstream);
    server.request(test_req(req_body), err_checker!(ErrorCode::ServerError(-2)));
}

#[test]
fn res_gateway_bad_hex() {
    let call = "eth_call";
    let req_id = jrpc::Id::Str("non-conforming-gateway".into());
    let req_body = web3_req!(req_id, call, [json!({ "data": "0x00" }), "pending"]);

    let mut upstream = MockUpstream::new();
    upstream
        .expect_request()
        .returning(move |_| Ok(res(jrpc::Id::Number(1), "0x6" /* invalid hex */)));

    let mut server = TestServer::with_upstream(upstream);
    server.request(test_req(req_body), err_checker!(ErrorCode::InternalError));
}

#[test]
fn res_gateway_bad_res_id() {
    let call = "eth_call";
    let req_id = jrpc::Id::Str("tampering-gateway".into());
    let req_body = web3_req!(req_id, call, [json!({ "data": "0x00" }), "pending"]);

    let mut upstream = MockUpstream::new();
    upstream
        .expect_request()
        .returning(move |_| Ok(res(jrpc::Id::Number(2), "0x66")));

    let mut server = TestServer::with_upstream(upstream);
    server.request(test_req(req_body), err_checker!(ErrorCode::ServerError(-2)));
}

#[test]
fn res_gateway_unavailable() {
    let call = "eth_getCode";
    let req_body = web3_req!(jrpc::Id::Str("gone".into()), call, ["0xwherever"]);

    let mut upstream = MockUpstream::new();
    upstream
        .expect_request()
        .returning(move |_| Err(Error::Timeout));

    let mut server = TestServer::with_upstream(upstream);
    server.request(test_req(req_body), err_checker!(ErrorCode::ServerIsBusy));
}
