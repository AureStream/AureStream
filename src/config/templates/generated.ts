export const BUILD_TIME_TEMPLATE_SOURCE = {
    repo: 'OneOhCloud/conf-template',
    branch: 'stable',
    commit: 'built-in',
    versionPath: '1.13.8',
    singBoxVersion: 'v1.13.12',
    generatedAt: new Date().toISOString(),
} as const;

export const MIXED_TEMPLATE = {
    log: { level: "info" },
    inbounds: [
        { type: "mixed", tag: "mixed", listen: "127.0.0.1", listen_port: 2345 }
    ],
    outbounds: [
        { type: "direct", tag: "direct" },
        { type: "selector", tag: "select", outbounds: ["auto", "direct"] },
        { type: "urltest", tag: "auto", outbounds: [] }
    ],
    route: {
        auto_detect_interface: true,
        default_domain_resolver: {
            server: "local"
        },
        rule_set: [
            {
                format: "binary",
                tag: "geoip-cn",
                type: "remote",
                url: "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
                download_detour: "select"
            },
            {
                format: "binary",
                tag: "geosite-cn",
                type: "remote",
                url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-geolocation-cn.srs",
                download_detour: "select"
            },
            {
                format: "binary",
                tag: "ext-cn-domain",
                type: "remote",
                url: "https://raw.githubusercontent.com/xmdhs/cn-domain-list/rule-set/ext-cn-list.srs",
                download_detour: "select"
            }
        ],
        rules: [
            { action: "sniff" },
            { action: "hijack-dns", protocol: "dns" },
            { action: "resolve", strategy: "prefer_ipv4" },
            { domain: ["direct-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "direct" },
            { domain: ["proxy-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "select" },
            { ip_is_private: true, outbound: "direct" },
            { rule_set: ["geosite-cn"], outbound: "direct" },
            { rule_set: ["ext-cn-domain"], outbound: "direct" },
            { rule_set: ["geoip-cn"], outbound: "direct" },
            { outbound: "select" }
        ]
    },
    dns: {
        independent_cache: true,
        rules: [
            { action: "predefined", query_type: "HTTPS" },
            { rule_set: ["geosite-cn"], server: "local" },
            { rule_set: ["ext-cn-domain"], server: "local" }
        ],
        servers: [
            { detour: "select", server: "8.8.8.8", tag: "remote", type: "https" },
            { server: "223.5.5.5", tag: "local", type: "https" },
            { tag: "system", type: "dhcp" }
        ],
        strategy: "prefer_ipv4"
    },
    experimental: {}
};

export const TUN_TEMPLATE = {
    log: { level: "info" },
    inbounds: [
        { type: "tun", tag: "tun", stack: "gvisor", interface_name: "utun233" },
        { type: "mixed", tag: "mixed", listen: "127.0.0.1", listen_port: 2345 }
    ],
    outbounds: [
        { type: "direct", tag: "direct" },
        { type: "selector", tag: "select", outbounds: ["auto", "direct"] },
        { type: "urltest", tag: "auto", outbounds: [] }
    ],
    route: {
        auto_detect_interface: true,
        default_domain_resolver: {
            server: "local"
        },
        rule_set: [
            {
                format: "binary",
                tag: "geoip-cn",
                type: "remote",
                url: "https://raw.githubusercontent.com/SagerNet/sing-geoip/rule-set/geoip-cn.srs",
                download_detour: "select"
            },
            {
                format: "binary",
                tag: "geosite-cn",
                type: "remote",
                url: "https://raw.githubusercontent.com/SagerNet/sing-geosite/rule-set/geosite-geolocation-cn.srs",
                download_detour: "select"
            },
            {
                format: "binary",
                tag: "ext-cn-domain",
                type: "remote",
                url: "https://raw.githubusercontent.com/xmdhs/cn-domain-list/rule-set/ext-cn-list.srs",
                download_detour: "select"
            }
        ],
        rules: [
            { action: "sniff" },
            { action: "hijack-dns", protocol: "dns" },
            { action: "resolve", strategy: "prefer_ipv4" },
            { domain: ["direct-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "direct" },
            { domain: ["proxy-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "select" },
            { ip_is_private: true, outbound: "direct" },
            { rule_set: ["geosite-cn"], outbound: "direct" },
            { rule_set: ["ext-cn-domain"], outbound: "direct" },
            { rule_set: ["geoip-cn"], outbound: "direct" },
            { outbound: "select" }
        ]
    },
    dns: {
        independent_cache: true,
        rules: [
            { action: "predefined", query_type: "HTTPS" },
            { rule_set: ["geosite-cn"], server: "local" },
            { rule_set: ["ext-cn-domain"], server: "local" }
        ],
        servers: [
            { detour: "select", server: "8.8.8.8", tag: "remote", type: "https" },
            { server: "223.5.5.5", tag: "local", type: "https" },
            { tag: "system", type: "dhcp" }
        ],
        strategy: "prefer_ipv4"
    },
    experimental: {}
};

export const MIXED_GLOBAL_TEMPLATE = {
    log: { level: "info" },
    inbounds: [
        { type: "mixed", tag: "mixed", listen: "127.0.0.1", listen_port: 2345 }
    ],
    outbounds: [
        { type: "direct", tag: "direct" },
        { type: "selector", tag: "select", outbounds: ["auto", "direct"] },
        { type: "urltest", tag: "auto", outbounds: [] }
    ],
    route: {
        rules: [
            { domain: ["direct-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "direct" },
            { domain: ["proxy-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "select" },
            { ip_is_private: true, outbound: "direct" },
            { outbound: "select" }
        ]
    },
    dns: {
        servers: [
            { tag: "system", type: "dhcp" }
        ]
    },
    experimental: {}
};

export const TUN_GLOBAL_TEMPLATE = {
    log: { level: "info" },
    inbounds: [
        { type: "tun", tag: "tun", stack: "gvisor", interface_name: "utun233" },
        { type: "mixed", tag: "mixed", listen: "127.0.0.1", listen_port: 2345 }
    ],
    outbounds: [
        { type: "direct", tag: "direct" },
        { type: "selector", tag: "select", outbounds: ["auto", "direct"] },
        { type: "urltest", tag: "auto", outbounds: [] }
    ],
    route: {
        rules: [
            { domain: ["direct-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "direct" },
            { domain: ["proxy-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "select" },
            { ip_is_private: true, outbound: "direct" },
            { outbound: "select" }
        ]
    },
    dns: {
        servers: [
            { tag: "system", type: "dhcp" }
        ]
    },
    experimental: {}
};

export const BUILT_IN_TEMPLATE_OBJECTS: Record<string, any> = {
    'mixed': MIXED_TEMPLATE,
    'tun': TUN_TEMPLATE,
    'mixed-global': MIXED_GLOBAL_TEMPLATE,
    'tun-global': TUN_GLOBAL_TEMPLATE,
};
