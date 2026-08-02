export type StageVersionType = "stable" | "beta" | "dev";

/** Config profile type — encodes both routing mode and proxy mode. */
export type configType = 'mixed' | 'tun' | 'mixed-global' | 'tun-global';

export const ALL_CONFIG_MODES: configType[] = ['mixed', 'tun', 'mixed-global', 'tun-global'];
