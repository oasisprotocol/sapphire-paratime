use super::*;

use mockall::predicate::*;

#[test]
fn send_transaction() {
    let req_id = jrpc::Id::Number(1);
    let res_id = req_id.clone();

    let send_raw_tx = "eth_sendRawTransaction";

    let req_body = web3_req!(req_id, send_raw_tx, ["1234"]);
    let expected_proxy_req_body =
        web3_req!(req_id, send_raw_tx, [format!("0x{}1234", tx_enc_prefix())]);

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
fn call() {
    let req_id = jrpc::Id::Str("id".into());
    let res_id = req_id.clone();

    let call = "eth_call";
    let data_hex = "b100b0771ec0ffee";

    let req_body = web3_req!(req_id, call, [json!({ "data": data_hex }), "latest"]);
    let expected_proxy_req_body = web3_req!(
        req_id,
        call,
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
                &format!("{}{data_hex}", rx_enc_prefix()),
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

#[test]
fn estimate_gas() {
    let req_id = jrpc::Id::Null;
    let res_id = req_id.clone();

    let estimate_gas = "eth_estimateGas";
    let data_hex = "b100b0771ec0ffee";

    let req_body = web3_req!(
        req_id,
        estimate_gas,
        [json!({ "data": data_hex, "value": 42u64 }), 999u32]
    );
    let expected_proxy_req_body = web3_req!(
        req_id,
        estimate_gas,
        [
            json!({ "data": format!("0x{}{data_hex}", tx_enc_prefix()), "value": 42u64 }),
            999u32
        ]
    );

    let gas_used = "0x88888888";

    let mut upstream = MockUpstream::new();
    upstream
        .expect_request()
        .with(function(move |req_body| {
            serde_json::from_slice::<serde_json::Value>(req_body).unwrap()
                == serde_json::from_str::<serde_json::Value>(&expected_proxy_req_body).unwrap()
        }))
        .returning(move |_| Ok(res(res_id.clone(), gas_used)));

    let mut server = TestServer::with_upstream(upstream);
    server.request(test_req(req_body), |res| {
        let web3_res = res.unwrap();
        assert_eq!(web3_res.id, req_id);
        assert_eq!(web3_res.result.to_value().as_str().unwrap(), gas_used);
    });
}

#[test]
fn non_confidential() {
    let req_id = jrpc::Id::Str("non-confidential".into());
    let res_id = req_id.clone();

    let block_number = "eth_blockNumber";
    let req_body = web3_req!(req_id, block_number, []);
    let expected_proxy_req_body = web3_req!(req_id, block_number, []);

    let block_number = "098765";

    let mut upstream = MockUpstream::new();
    upstream
        .expect_request()
        .with(function(move |req_body| {
            req_body == expected_proxy_req_body.as_bytes()
        }))
        .returning(move |_| Ok(res(res_id.clone(), block_number)));

    let mut server = TestServer::with_upstream(upstream);
    server.request(test_req(req_body), |res| {
        let web3_res = res.unwrap();
        assert_eq!(web3_res.id, req_id);
        assert_eq!(web3_res.result.to_value().as_str().unwrap(), block_number);
    });
}
