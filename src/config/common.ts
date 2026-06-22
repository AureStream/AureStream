import { SING_BOX_MAJOR_VERSION } from "../types/definition";

/** Config template type — encodes both routing mode and proxy mode. */
export type configType = 'mixed' | 'tun' | 'mixed-global' | 'tun-global';

export const TEMPLATE_CACHE_SCHEMA_VERSION = 15;

export async function getConfigTemplateCacheKey(mode: configType): Promise<string> {
    return `key-sing-box-${SING_BOX_MAJOR_VERSION}-${mode}-template-config-cache-v${TEMPLATE_CACHE_SCHEMA_VERSION}`;
}
