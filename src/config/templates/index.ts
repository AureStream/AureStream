import type { configType } from '../common';
import { BUILD_TIME_TEMPLATE_SOURCE, BUILT_IN_TEMPLATE_OBJECTS } from './generated';

export { BUILD_TIME_TEMPLATE_SOURCE };

/**
 * Returns the build-time snapshot synced from OneOhCloud/conf-template.
 * The generated module stores real object literals, so TypeScript validates
 * template syntax at build time; callers keep the existing JSON string cache
 * boundary by stringifying here.
 */
export function getBuiltInTemplate(mode: configType): string {
    const template = BUILT_IN_TEMPLATE_OBJECTS[mode];
    if (template === undefined) {
        throw new Error(
            `[template] no built-in fallback for mode="${mode}" ` +
                `(snapshot from ${BUILD_TIME_TEMPLATE_SOURCE.repo}@${BUILD_TIME_TEMPLATE_SOURCE.branch} ` +
                `commit ${BUILD_TIME_TEMPLATE_SOURCE.commit.slice(0, 8)})`,
        );
    }
    return JSON.stringify(template);
}
