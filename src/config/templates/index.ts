import type { configType } from '../common';
import {
    BUILD_TIME_TEMPLATE_SOURCE,
    BUILT_IN_TEMPLATE_OBJECTS,
} from './generated';

function cloneTemplate(mode: configType): any {
    const template = BUILT_IN_TEMPLATE_OBJECTS[mode];
    if (!template) {
        throw new Error(`[template] unsupported config mode: ${mode}`);
    }
    return structuredClone(template);
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
    const baseConfig = cloneTemplate(mode);
    normalizeTemplateConfig(baseConfig);
    return JSON.stringify(baseConfig);
}

export { BUILD_TIME_TEMPLATE_SOURCE };
