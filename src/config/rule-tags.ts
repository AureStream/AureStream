/** Placeholder domains in built-in route templates for custom rule injection. */
export const DIRECT_RULE_SLOT = 'direct-tag.aurestream.local';
export const PROXY_RULE_SLOT = 'proxy-tag.aurestream.local';

/** @deprecated Legacy OneBox template markers — still matched when merging old caches. */
export const LEGACY_DIRECT_RULE_SLOT = 'direct-tag.oneoh.cloud';
export const LEGACY_PROXY_RULE_SLOT = 'proxy-tag.oneoh.cloud';

export function ruleSlotMatches(
    rule: { domain?: string[] },
    slot: string,
    legacySlot: string
): boolean {
    if (!rule.domain || !Array.isArray(rule.domain)) return false;
    return rule.domain.includes(slot) || rule.domain.includes(legacySlot);
}
