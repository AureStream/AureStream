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
        { type: "selector", tag: "select", outbounds: ["direct"] },
        { type: "urltest", tag: "auto", outbounds: ["direct"] }
    ],
    route: {
        rules: [
            { domain: ["direct-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "direct" },
            { domain: ["proxy-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "select" }
        ]
    },
    dns: {
        servers: [
            { tag: "system", type: "dhcp" }
        ]
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
        { type: "selector", tag: "select", outbounds: ["direct"] },
        { type: "urltest", tag: "auto", outbounds: ["direct"] }
    ],
    route: {
        rules: [
            { domain: ["direct-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "direct" },
            { domain: ["proxy-tag.oneoh.cloud"], domain_suffix: [], ip_cidr: [], outbound: "select" }
        ]
    },
    dns: {
        servers: [
            { tag: "system", type: "dhcp" }
        ]
    },
    experimental: {}
};

export const MIXED_GLOBAL_TEMPLATE = MIXED_TEMPLATE;
export const TUN_GLOBAL_TEMPLATE = TUN_TEMPLATE;

export const BUILT_IN_TEMPLATE_OBJECTS: Record<string, any> = {
    'mixed': MIXED_TEMPLATE,
    'tun': TUN_TEMPLATE,
    'mixed-global': MIXED_GLOBAL_TEMPLATE,
    'tun-global': TUN_GLOBAL_TEMPLATE,
};
