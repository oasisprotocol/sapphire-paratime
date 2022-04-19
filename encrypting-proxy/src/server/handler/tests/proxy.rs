use super::*;

#[test]
fn roundtrip() {
    let upstream = MockUpstream::new();
    let server = TestServer::with_upstream(upstream);
}
