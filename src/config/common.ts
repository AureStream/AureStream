import { SING_BOX_MAJOR_VERSION } from "../types/definition";

export type StageVersionType = "stable" | "beta" | "dev";

/** Config template type — encodes both routing mode and proxy mode. */
export type configType = 'mixed' | 'tun' | 'mixed-global' | 'tun-global';

export const TEMPLATE_CACHE_SCHEMA_VERSION = 16;

export const ALL_CONFIG_MODES: configType[] = ['mixed', 'tun', 'mixed-global', 'tun-global'];

export async function getConfigTemplateCacheKey(mode: configType): Promise<string> {
    return `key-sing-box-${SING_BOX_MAJOR_VERSION}-${mode}-template-config-cache-v${TEMPLATE_CACHE_SCHEMA_VERSION}`;
}

export function isStaleTemplatePathOverride(url: unknown): boolean {
    return typeof url === 'string' && /\/conf\/1\.13\/zh-cn\//.test(url);
}
