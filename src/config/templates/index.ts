import type { configType } from '../common';
import { parse as parseJsonc } from 'jsonc-parser';
import mixedTemplate from './mixed-template.jsonc?raw';
import tunTemplate from './tun-template.jsonc?raw';

export const BUILD_TIME_TEMPLATE_SOURCE = {
    repo: 'OneOhCloud/conf-template',
    branch: 'stable',
    commit: 'b721900b9449fa8b1d6c73c86b9ae011ce2b670b',
    versionPath: '1.13.8',
    singBoxVersion: 'v1.13.12',
    generatedAt: '2026-06-02T12:51:28.048Z',
} as const;

function parseTemplate(raw: string): any {
    const errors: any[] = [];
    const config: any = parseJsonc(raw, errors, { allowTrailingComma: true });
    if (errors.length > 0 || !config) {
        throw new Error(`[template] failed to parse JSONC template: ${JSON.stringify(errors)}`);
    }
    return config;
}

export function normalizeTemplateConfig(config: any): boolean {
    let changed = false;
    const inbounds = Array.isArray(config?.inbounds) ? config.inbounds : [];

    for (const inbound of inbounds) {
        if (inbound?.type !== "tun") continue;
        if (Array.isArray(inbound.inet4_bypass_address)) {
            const existing = Array.isArray(inbound.route_exclude_address)
                ? inbound.route_exclude_address
                : [];
            inbound.route_exclude_address = Array.from(new Set([
                ...existing,
                ...inbound.inet4_bypass_address,
            ]));
            delete inbound.inet4_bypass_address;
            changed = true;
        }
    }

    return changed;
}

export function getBuiltInTemplate(mode: configType): string {
    const isTun = mode === 'tun' || mode === 'tun-global';
    const baseConfig = parseTemplate(isTun ? tunTemplate : mixedTemplate);
    normalizeTemplateConfig(baseConfig);

    if (mode === 'mixed-global' || mode === 'tun-global') {
        baseConfig.dns.rules = baseConfig.dns.rules.filter((rule: any) =>
            !Array.isArray(rule.rule_set)
        );
        baseConfig.route.rules = baseConfig.route.rules.filter((rule: any) => {
            const domains = Array.isArray(rule.domain) ? rule.domain : [];
            const hasCustomSlot = domains.includes('direct-tag.oneoh.cloud')
                || domains.includes('proxy-tag.oneoh.cloud')
                || domains.includes('direct-tag.aurestream.local')
                || domains.includes('proxy-tag.aurestream.local');
            const hasProxyOnlyRules = Array.isArray(rule.rule_set)
                && rule.outbound === 'ExitGateway';
            return !hasCustomSlot && !hasProxyOnlyRules;
        });
    }

    return JSON.stringify(baseConfig);
}
