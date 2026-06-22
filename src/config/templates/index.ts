import type { configType } from '../common';
import { parse as parseJsonc } from 'jsonc-parser';
import mixedTemplate from './mixed-template.jsonc?raw';
import tunTemplate from './tun-template.jsonc?raw';

export const BUILD_TIME_TEMPLATE_SOURCE = {
    repo: 'Local/config-templates',
    branch: 'local',
    commit: 'local',
    versionPath: 'local',
    singBoxVersion: 'v1.13.13',
    generatedAt: new Date().toISOString(),
} as const;

function parseTemplate(raw: string): any {
    const errors: any[] = [];
    const config: any = parseJsonc(raw, errors, { allowTrailingComma: true });
    if (errors.length > 0 || !config) {
        throw new Error(`[template] failed to parse local JSONC template: ${JSON.stringify(errors)}`);
    }
    return config;
}

export function getBuiltInTemplate(mode: configType): string {
    // Select the base template based on proxy mode (mixed = SystemProxy, tun = TUN)
    const isTun = mode === 'tun' || mode === 'tun-global';
    const baseConfig = parseTemplate(isTun ? tunTemplate : mixedTemplate);

    if (mode === 'mixed-global' || mode === 'tun-global') {
        // Rewrite route rules for global proxy mode
        baseConfig.route.rules = [
            { "action": "sniff" },
            { "protocol": "dns", "action": "hijack-dns" },
            { "action": "resolve", "strategy": "prefer_ipv4" },
            { "outbound": "ExitGateway" }
        ];
    }

    return JSON.stringify(baseConfig);
}
