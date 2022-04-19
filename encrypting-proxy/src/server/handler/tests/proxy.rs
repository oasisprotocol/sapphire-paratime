use super::*;

use mockall::predicate::*;

macro_rules! web3_req {
    ($req_id:expr, $method:literal, [$($param:expr),+ $(,)?]) => {
        serde_json::to_string(
            &jrpc::RequestSer::new(
                &$req_id,
                $method,
                Some(jrpc::ParamsSer::Array(vec![$($param.into()),+])),
            )
        )
        .unwrap()
    };
}

fn res(req_id: jrpc::Id<'_>, result: &str) -> ureq::Response {
    ureq::Response::new(
        200,
        "OK",
        &serde_json::to_string(&jrpc::Response::new(result, req_id)).unwrap(),
    )
    .unwrap()
}

fn tx_enc_prefix() -> String {
    hex::encode(MockCipher::TX_ENC_TAG)
}

fn rx_enc_prefix() -> String {
    hex::encode(MockCipher::RX_ENC_TAG)
}

#[test]
fn roundtrip_send_transaction() {
    let req_id = jrpc::Id::Number(1);
    let res_id = req_id.clone();

    let req_body = web3_req!(req_id, "eth_sendRawTransaction", ["1234"]);
    let expected_proxy_req_body = web3_req!(
        req_id,
        "eth_sendRawTransaction",
        [format!("0x{}1234", tx_enc_prefix())]
    );

    let tx_hash = "0x8d932230a2a62adab89071535e0ef3a6b02d89af4d92bf461fc771aa0e378394";
    let mut upstream = MockUpstream::new();
    upstream
        .expect_request()
        .with(function(move |req_body| {
            req_body == expected_proxy_req_body.as_bytes()
        }))
        .returning(move |_| Ok(res(res_id.clone(), tx_hash)));

    let mut server = TestServer::with_upstream(upstream);
    server.request(test_req(req_body), |res| {
        let web3_res = res.unwrap();
        assert_eq!(web3_res.id, req_id);
        assert_eq!(web3_res.result.to_value().as_str().unwrap(), tx_hash);
    });
}

#[test]
fn roundtrip_call() {
    let req_id = jrpc::Id::Str("id".into());
    let res_id = req_id.clone();

    let data_hex = "b100b0771ec0ffee";

    let req_body = web3_req!(req_id, "eth_call", [json!({ "data": data_hex }), "latest"]);
    let expected_proxy_req_body = web3_req!(
        req_id,
        "eth_call",
        [
            json!({ "data": format!("0x{}{data_hex}", tx_enc_prefix()) }),
            "latest"
        ]
    );

    let mut upstream = MockUpstream::new();
    upstream
        .expect_request()
        .with(function(move |req_body| {
            req_body == expected_proxy_req_body.as_bytes()
        }))
        .returning(move |_| {
            Ok(res(
                res_id.clone(),
                &dbg!(format!("{}{data_hex}", rx_enc_prefix())),
            ))
        });

    let mut server = TestServer::with_upstream(upstream);
    server.request(test_req(req_body), |res| {
        let web3_res = res.unwrap();
        assert_eq!(web3_res.id, req_id);
        assert_eq!(
            web3_res
                .result
                .to_value()
                .as_str()
                .and_then(|s| s.strip_prefix("0x"))
                .unwrap(),
            data_hex
        );
    });
}
