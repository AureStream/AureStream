import { SING_BOX_MAJOR_VERSION } from "../types/definition";

export type StageVersionType = "stable" | "beta" | "dev";
export type configType = 'mixed' | 'tun' | 'mixed-global' | 'tun-global';

export const TEMPLATE_CACHE_SCHEMA_VERSION = 4;
export const ALL_CONFIG_MODES: configType[] = ['mixed', 'tun', 'mixed-global', 'tun-global'];

export async function getConfigTemplateCacheKey(mode: configType): Promise<string> {
    return `key-sing-box-${SING_BOX_MAJOR_VERSION}-${mode}-template-config-cache-v${TEMPLATE_CACHE_SCHEMA_VERSION}`;
}
