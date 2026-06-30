// AUTO-GENERATED
import type { configType } from '../common';

export const BUILD_TIME_TEMPLATE_SOURCE = { repo: 'BadKid90s/AureStream-Config', branch: 'main', versionPath: '1.13', singBoxVersion: 'v1.13.13' } as const;

export const MIXED_TEMPLATE = {
    "log": {
        "disabled": false,
        "level": "debug",
        "timestamp": false
    },
    "dns": {
        "servers": [
            {
                "tag": "remote",
                "address": "https://8.8.8.8/dns-query",
                "detour": "ExitGateway"
            },
            {
                "tag": "local",
                "address": "https://223.5.5.5/dns-query",
                "detour": "direct"
            }
        ],
        "rules": [
            {
                "rule_set": "geosite-cn",
                "server": "local"
            },
            {
                "rule_set": "geosite-microsoft-cn",
                "server": "local"
            }
        ],
        "final": "remote",
        "strategy": "prefer_ipv4",
        "independent_cache": true
    },
    "inbounds": [
        {
            "tag": "mixed",
            "type": "mixed",
            "listen": "127.0.0.1",
            "listen_port": 6789,
            "set_system_proxy": false
        }
    ],
    "route": {
        "rules": [
            {
                "protocol": "dns",
                "action": "hijack-dns"
            },
            {
                "action": "resolve",
                "strategy": "prefer_ipv4"
            },
            {
                "domain": [
                    "reject-tag.oneoh.cloud"
                ],
                "action": "reject"
            },
            {
                "domain": [
                    "direct-tag.oneoh.cloud"
                ],
                "outbound": "direct"
            },
            {
                "domain": [
                    "proxy-tag.oneoh.cloud"
                ],
                "outbound": "ExitGateway"
            },
            {
                "ip_is_private": true,
                "outbound": "direct"
            },
            {
                "rule_set": "geoip-cn",
                "outbound": "direct"
            }
        ],
        "final": "ExitGateway",
        "default_domain_resolver": "local",
        "auto_detect_interface": true,
        "rule_set": [
            {
                "tag": "geoip-cn",
                "type": "remote",
                "format": "binary",
                "url": "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs"
            },
            {
                "tag": "geosite-cn",
                "type": "remote",
                "format": "binary",
                "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-geolocation-cn.srs"
            },
            {
                "tag": "geosite-microsoft-cn",
                "type": "remote",
                "format": "binary",
                "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-microsoft@cn.srs"
            }
        ]
    },
    "experimental": {
        "clash_api": {},
        "cache_file": {}
    },
    "outbounds": [
        {
            "tag": "direct",
            "type": "direct"
        },
        {
            "tag": "ExitGateway",
            "type": "selector",
            "outbounds": [
                "auto"
            ],
            "interrupt_exist_connections": true
        },
        {
            "tag": "auto",
            "type": "urltest",
            "url": "https://www.google.com/generate_204",
            "outbounds": []
        }
    ]
} as const;

export const TUN_TEMPLATE = {
    "log": {
        "disabled": false,
        "level": "debug",
        "timestamp": false
    },
    "dns": {
        "servers": [
            {
                "tag": "remote",
                "address": "https://8.8.8.8/dns-query",
                "detour": "ExitGateway"
            },
            {
                "tag": "local",
                "address": "https://223.5.5.5/dns-query",
                "detour": "direct"
            },
            {
                "tag": "fakeip",
                "address": "fakeip"
            }
        ],
        "rules": [
            {
                "rule_set": "geosite-cn",
                "server": "local"
            },
            {
                "rule_set": "geosite-microsoft-cn",
                "server": "local"
            },
            {
                "query_type": [
                    "A",
                    "AAAA"
                ],
                "rewrite_ttl": 1,
                "server": "fakeip"
            }
        ],
        "strategy": "prefer_ipv4",
        "independent_cache": true,
        "fakeip": {
            "enabled": true,
            "inet4_range": "198.18.0.0/15",
            "inet6_range": "2001:0470:f9da:fdfa::1/64"
        }
    },
    "inbounds": [
        {
            "tag": "tun",
            "type": "tun",
            "address": [
                "172.19.0.1/30",
                "fdfe:dcba:9876::1/126"
            ],
            "platform": {
                "http_proxy": {
                    "enabled": true,
                    "server": "127.0.0.1",
                    "server_port": 6789
                }
            },
            "mtu": 1500,
            "stack": "gvisor",
            "auto_route": true,
            "strict_route": true,
            "endpoint_independent_nat": true,
            "route_exclude_address": [
                "10.0.0.0/8",
                "127.0.0.0/8",
                "169.254.0.0/16",
                "172.16.0.0/12",
                "192.0.0.0/24",
                "192.168.0.0/16",
                "224.0.0.0/4",
                "240.0.0.0/4",
                "255.255.255.255/32",
                "fe80::/10",
                "fd00::/8",
                "ff01::/16",
                "ff02::/16",
                "ff03::/16",
                "ff04::/16",
                "ff05::/16"
            ]
        },
        {
            "tag": "mixed",
            "type": "mixed",
            "listen": "127.0.0.1",
            "listen_port": 6789,
            "set_system_proxy": false
        }
    ],
    "route": {
        "rules": [
            {
                "protocol": "dns",
                "action": "hijack-dns"
            },
            {
                "action": "resolve",
                "strategy": "prefer_ipv4"
            },
            {
                "domain": [
                    "reject-tag.oneoh.cloud"
                ],
                "action": "reject"
            },
            {
                "domain": [
                    "direct-tag.oneoh.cloud"
                ],
                "outbound": "direct"
            },
            {
                "domain": [
                    "proxy-tag.oneoh.cloud"
                ],
                "outbound": "ExitGateway"
            },
            {
                "ip_is_private": true,
                "outbound": "direct"
            },
            {
                "rule_set": "geoip-cn",
                "outbound": "direct"
            }
        ],
        "final": "ExitGateway",
        "default_domain_resolver": "local",
        "auto_detect_interface": true,
        "rule_set": [
            {
                "tag": "geoip-cn",
                "type": "remote",
                "format": "binary",
                "url": "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs"
            },
            {
                "tag": "geosite-cn",
                "type": "remote",
                "format": "binary",
                "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-geolocation-cn.srs"
            },
            {
                "tag": "geosite-microsoft-cn",
                "type": "remote",
                "format": "binary",
                "url": "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-microsoft@cn.srs"
            }
        ]
    },
    "experimental": {
        "clash_api": {},
        "cache_file": {}
    },
    "outbounds": [
        {
            "tag": "direct",
            "type": "direct"
        },
        {
            "tag": "ExitGateway",
            "type": "selector",
            "outbounds": [
                "auto"
            ],
            "interrupt_exist_connections": true
        },
        {
            "tag": "auto",
            "type": "urltest",
            "url": "https://www.google.com/generate_204",
            "outbounds": []
        }
    ]
} as const;

export const MIXED_GLOBAL_TEMPLATE = {
    "log": {
        "disabled": false,
        "level": "debug",
        "timestamp": false
    },
    "dns": {
        "servers": [
            {
                "tag": "remote",
                "address": "https://8.8.8.8/dns-query",
                "detour": "ExitGateway"
            },
            {
                "tag": "local",
                "address": "https://223.5.5.5/dns-query",
                "detour": "direct"
            }
        ],
        "rules": [],
        "final": "remote",
        "strategy": "prefer_ipv4",
        "independent_cache": true
    },
    "inbounds": [
        {
            "tag": "mixed",
            "type": "mixed",
            "listen": "127.0.0.1",
            "listen_port": 6789,
            "set_system_proxy": false
        }
    ],
    "route": {
        "rules": [
            {
                "protocol": "dns",
                "action": "hijack-dns"
            },
            {
                "action": "resolve",
                "strategy": "prefer_ipv4"
            },
            {
                "ip_is_private": true,
                "outbound": "direct"
            }
        ],
        "final": "ExitGateway",
        "default_domain_resolver": "local",
        "auto_detect_interface": true,
        "rule_set": []
    },
    "experimental": {
        "clash_api": {},
        "cache_file": {}
    },
    "outbounds": [
        {
            "tag": "direct",
            "type": "direct"
        },
        {
            "tag": "ExitGateway",
            "type": "selector",
            "outbounds": [
                "auto"
            ],
            "interrupt_exist_connections": true
        },
        {
            "tag": "auto",
            "type": "urltest",
            "url": "https://www.google.com/generate_204",
            "outbounds": []
        }
    ]
} as const;

export const TUN_GLOBAL_TEMPLATE = {
    "log": {
        "disabled": false,
        "level": "debug",
        "timestamp": false
    },
    "dns": {
        "servers": [
            {
                "tag": "remote",
                "address": "https://8.8.8.8/dns-query",
                "detour": "ExitGateway"
            },
            {
                "tag": "local",
                "address": "https://223.5.5.5/dns-query",
                "detour": "direct"
            },
            {
                "tag": "fakeip",
                "address": "fakeip"
            }
        ],
        "rules": [
            {
                "query_type": [
                    "A",
                    "AAAA"
                ],
                "rewrite_ttl": 1,
                "server": "fakeip"
            }
        ],
        "strategy": "prefer_ipv4",
        "independent_cache": true,
        "fakeip": {
            "enabled": true,
            "inet4_range": "198.18.0.0/15",
            "inet6_range": "2001:0470:f9da:fdfa::1/64"
        }
    },
    "inbounds": [
        {
            "tag": "tun",
            "type": "tun",
            "address": [
                "172.19.0.1/30",
                "fdfe:dcba:9876::1/126"
            ],
            "platform": {
                "http_proxy": {
                    "enabled": true,
                    "server": "127.0.0.1",
                    "server_port": 6789
                }
            },
            "mtu": 1500,
            "stack": "gvisor",
            "auto_route": true,
            "strict_route": true,
            "endpoint_independent_nat": true,
            "route_exclude_address": [
                "10.0.0.0/8",
                "127.0.0.0/8",
                "169.254.0.0/16",
                "172.16.0.0/12",
                "192.0.0.0/24",
                "192.168.0.0/16",
                "224.0.0.0/4",
                "240.0.0.0/4",
                "255.255.255.255/32",
                "fe80::/10",
                "fd00::/8",
                "ff01::/16",
                "ff02::/16",
                "ff03::/16",
                "ff04::/16",
                "ff05::/16"
            ]
        },
        {
            "tag": "mixed",
            "type": "mixed",
            "listen": "127.0.0.1",
            "listen_port": 6789,
            "set_system_proxy": false
        }
    ],
    "route": {
        "rules": [
            {
                "protocol": "dns",
                "action": "hijack-dns"
            },
            {
                "action": "resolve",
                "strategy": "prefer_ipv4"
            },
            {
                "ip_is_private": true,
                "outbound": "direct"
            }
        ],
        "final": "ExitGateway",
        "default_domain_resolver": "local",
        "auto_detect_interface": true,
        "rule_set": []
    },
    "experimental": {
        "clash_api": {},
        "cache_file": {}
    },
    "outbounds": [
        {
            "tag": "direct",
            "type": "direct"
        },
        {
            "tag": "ExitGateway",
            "type": "selector",
            "outbounds": [
                "auto"
            ],
            "interrupt_exist_connections": true
        },
        {
            "tag": "auto",
            "type": "urltest",
            "url": "https://www.google.com/generate_204",
            "outbounds": []
        }
    ]
} as const;

export const BUILT_IN_TEMPLATE_OBJECTS: Record<configType, unknown> = {
    'mixed': MIXED_TEMPLATE,
    'tun': TUN_TEMPLATE,
    'mixed-global': MIXED_GLOBAL_TEMPLATE,
    'tun-global': TUN_GLOBAL_TEMPLATE,
};
