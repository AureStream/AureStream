import type { configType } from '../common';
import { BUILD_TIME_TEMPLATE_SOURCE, BUILT_IN_TEMPLATE_OBJECTS } from './generated';

export { BUILD_TIME_TEMPLATE_SOURCE };

export function getBuiltInTemplate(mode: configType): string {
    const template = BUILT_IN_TEMPLATE_OBJECTS[mode];
    if (template === undefined) {
        throw new Error(`[template] no built-in fallback for mode="${mode}"`);
    }
    return JSON.stringify(template);
}
