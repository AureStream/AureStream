import type { configType } from '../common';
import { parse as parseJsonc } from 'jsonc-parser';
import rawTemplate from './config-template.jsonc?raw';

export const BUILD_TIME_TEMPLATE_SOURCE = {
    repo: 'Local/config-templates',
    branch: 'local',
    commit: 'local',
    versionPath: 'local',
    singBoxVersion: 'v1.13.13',
    generatedAt: new Date().toISOString(),
} as const;

export function getBuiltInTemplate(mode: configType): string {
    const errors: any[] = [];
    const baseConfig: any = parseJsonc(rawTemplate, errors, { allowTrailingComma: true });
    if (errors.length > 0 || !baseConfig) {
        throw new Error(`[template] failed to parse local JSONC template: ${JSON.stringify(errors)}`);
    }

    // Adapt base template based on selected mode dynamically
    if (mode === 'mixed' || mode === 'mixed-global') {
        // Remove TUN inbound for Mixed mode
        baseConfig.inbounds = baseConfig.inbounds.filter((ib: any) => ib.type !== 'tun');
    }

    if (mode === 'mixed-global' || mode === 'tun-global') {
        // Rewrite route rules for global proxy mode
        baseConfig.route.rules = [
            {
                "action": "sniff"
            },
            {
                "protocol": "dns",
                "action": "hijack-dns"
            },
            {
                "action": "resolve",
                "strategy": "prefer_ipv4"
            },
            {
                "outbound": "ExitGateway"
            }
        ];
    }

    return JSON.stringify(baseConfig);
}
