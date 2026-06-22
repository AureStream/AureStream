import { SING_BOX_MAJOR_VERSION } from "../types/definition";

export type configType = 'rule' | 'global';

export const TEMPLATE_CACHE_SCHEMA_VERSION = 13;

export async function getConfigTemplateCacheKey(mode: configType): Promise<string> {
    return `key-sing-box-${SING_BOX_MAJOR_VERSION}-${mode}-template-config-cache-v${TEMPLATE_CACHE_SCHEMA_VERSION}`;
}
