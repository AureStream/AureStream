use aurestream_config::decode_subscription_body;

#[test]
fn decodes_vless_ws_sample() {
    let body = "vless://095909af-8903-4305-8a7d-07fd0fb8c0e3@162.159.38.162:443?security=tls&type=ws&host=example.com&path=%2F#node1";
    let nodes = decode_subscription_body(body).unwrap();
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].tag, "node1");
    assert_eq!(nodes[0].server, "162.159.38.162");
    assert_eq!(nodes[0].protocol, "vless");
}
