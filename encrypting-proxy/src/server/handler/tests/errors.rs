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

fn err_checker(expected_code: ErrorCode) -> impl FnOnce(HandlerResult<'_>) {
    move |res: HandlerResult<'_>| {
        let err = res.unwrap_err().error;
        assert_eq!(err.code, expected_code, "{}", err.message);
    }
}

#[test]
fn test_err_req_no_content_len() {
    let mut server = TestServer::new();
    server.request(
        test_req("jsonrpc").with_header(
            tiny_http::Header::from_bytes("content-length".as_bytes(), "".as_bytes()).unwrap(),
        ),
        err_checker(ErrorCode::InternalError),
    );
}

#[test]
fn test_err_req_malformed_jsonrpc() {
    let mut server = TestServer::new();
    server.request(test_req("{}"), err_checker(ErrorCode::ParseError));
}

#[test]
fn test_err_req_oversized() {
    let mut server = TestServer::new();
    let body: String = "1".repeat(MAX_REQUEST_SIZE_BYTES + 1);
    server.request(test_req(&body), err_checker(ErrorCode::OversizedRequest));
    server.request(
        test_req(&body).with_header(
            tiny_http::Header::from_bytes("content-length".as_bytes(), "1".as_bytes()).unwrap(),
        ),
        err_checker(ErrorCode::ParseError),
    );
}

#[test]
fn test_send_transaction_unsupported() {
    let mut server = TestServer::new();
    server.request(
        test_req(rpc_json!("eth_sendTransaction", "{}")),
        err_checker(ErrorCode::MethodNotFound),
    );
}

macro_rules! assert_invalid_params {
    ($server:ident, $method:literal, $params:tt) => {
        $server.request(
            test_req(rpc_json!($method, $params)),
            err_checker(ErrorCode::InvalidParams),
        )
    };
}

#[test]
fn test_err_req_invalid_params() {
    let mut server = TestServer::new();
    assert_invalid_params!(server, "eth_sendRawTransaction", "0x1234");
    assert_invalid_params!(server, "eth_call", ["{\"data\": \"0\"}"]);
}

#[test]
fn test_err_req_invalid_data() {
    let mut server = TestServer::new();
    assert_invalid_params!(server, "eth_sendRawTransaction", ["0x1"]);
    assert_invalid_params!(server, "eth_sendRawTransaction", ["0xgg"]);
    assert_invalid_params!(server, "eth_call", ["{\"data\": \"0x123\"}", "latest"]);
}
