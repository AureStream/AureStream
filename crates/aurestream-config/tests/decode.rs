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

#[test]
fn generates_unique_tags_for_duplicate_names() {
    // Three nodes with the same name "HK Node"
    let body = r#"vless://uuid1@1.1.1.1:443?security=tls#HK%20Node
vless://uuid2@2.2.2.2:443?security=tls#HK%20Node
vless://uuid3@3.3.3.3:443?security=tls#HK%20Node"#;

    let nodes = decode_subscription_body(body).unwrap();
    assert_eq!(nodes.len(), 3);

    // All nodes should have the same display name
    assert_eq!(nodes[0].name, "HK Node");
    assert_eq!(nodes[1].name, "HK Node");
    assert_eq!(nodes[2].name, "HK Node");

    // But unique tags
    assert_eq!(nodes[0].tag, "HK Node#1");
    assert_eq!(nodes[1].tag, "HK Node#2");
    assert_eq!(nodes[2].tag, "HK Node#3");

    // Different servers
    assert_eq!(nodes[0].server, "1.1.1.1");
    assert_eq!(nodes[1].server, "2.2.2.2");
    assert_eq!(nodes[2].server, "3.3.3.3");
}

#[test]
fn preserves_unique_tags() {
    // Two nodes with different names should keep their original tags
    let body = r#"vless://uuid1@1.1.1.1:443?security=tls#Node1
vless://uuid2@2.2.2.2:443?security=tls#Node2"#;

    let nodes = decode_subscription_body(body).unwrap();
    assert_eq!(nodes.len(), 2);

    // Unique names should not get suffixes
    assert_eq!(nodes[0].tag, "Node1");
    assert_eq!(nodes[1].tag, "Node2");
}
