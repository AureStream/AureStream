type RegionDisplayNames = {
  of(code: string): string | undefined
}
type RegionDisplayNamesConstructor = new (
  locales: string | string[],
  options: { type: "region" }
) => RegionDisplayNames

const REGION_INDICATOR_BASE = 0x1f1e6
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/
const COUNTRY_ALIASES: Record<string, string[]> = {
  AE: ["UAE", "阿联酋"],
  AU: ["AUS", "澳大利亚", "澳洲"],
  BR: ["BRA", "巴西"],
  CA: ["CAN", "加拿大"],
  CH: ["CHE", "瑞士"],
  CN: ["CHN", "中国", "大陆", "CHINA"],
  DE: ["DEU", "德国", "GERMANY"],
  ES: ["ESP", "西班牙"],
  FR: ["FRA", "法国", "FRANCE"],
  GB: ["UK", "GBR", "英国", "英國", "UNITED KINGDOM", "BRITAIN"],
  HK: ["HKG", "香港", "HONG KONG", "HONGKONG"],
  ID: ["IDN", "印度尼西亚", "印尼"],
  IN: ["IND", "印度"],
  JP: ["JPN", "日本", "JAPAN"],
  KR: ["KOR", "韩国", "韓國", "KOREA"],
  MO: ["MAC", "澳门", "澳門", "MACAO", "MACAU"],
  MY: ["MYS", "马来西亚", "馬來西亞"],
  NL: ["NLD", "荷兰", "荷蘭"],
  PH: ["PHL", "菲律宾", "菲律賓"],
  RU: ["RUS", "俄罗斯", "俄羅斯", "RUSSIA"],
  SG: ["SGP", "新加坡", "SINGAPORE"],
  TH: ["THA", "泰国", "泰國"],
  TR: ["TUR", "土耳其"],
  TW: ["TWN", "台湾", "台灣", "TAIWAN"],
  US: ["USA", "美国", "美國", "UNITED STATES", "AMERICA"],
  VN: ["VNM", "越南"],
}

const supportedValuesOf = (Intl as typeof Intl & {
  supportedValuesOf?: (key: "region") => string[]
}).supportedValuesOf
const flagCodes = supportedValuesOf
  ? supportedValuesOf("region").filter((code) => COUNTRY_CODE_PATTERN.test(code))
  : Object.keys(COUNTRY_ALIASES)
const DisplayNames = (Intl as typeof Intl & {
  DisplayNames?: RegionDisplayNamesConstructor
}).DisplayNames
const regionDisplayNames = DisplayNames
  ? [
      new DisplayNames("zh", { type: "region" }),
      new DisplayNames("en", { type: "region" }),
    ]
  : []
const regionNameMatches: Array<[string, string]> = DisplayNames
  ? flagCodes.flatMap((code) => {
      const names = regionDisplayNames.map((displayNames) =>
        displayNames.of(code)
      )
      return names
        .filter((name): name is string => Boolean(name))
        .map(
          (name) =>
            [code, name.normalize("NFKC").toUpperCase()] as [string, string]
        )
    })
  : []

function hasLatinToken(text: string, token: string): boolean {
  return new RegExp(`(^|[^A-Z])${token}(?=$|[^A-Z]|\\d)`).test(text)
}

function getFlagCodeFromEmoji(name: string): string {
  const chars = Array.from(name)
  for (let i = 0; i < chars.length - 1; i++) {
    const first = chars[i].codePointAt(0) ?? 0
    const second = chars[i + 1].codePointAt(0) ?? 0
    const isFlagPair =
      first >= REGION_INDICATOR_BASE &&
      first < REGION_INDICATOR_BASE + 26 &&
      second >= REGION_INDICATOR_BASE &&
      second < REGION_INDICATOR_BASE + 26
    if (isFlagPair) {
      const code =
        String.fromCharCode(65 + first - REGION_INDICATOR_BASE) +
        String.fromCharCode(65 + second - REGION_INDICATOR_BASE)
      return code
    }
  }
  return ""
}

export function getCountryCode(name: string): string {
  if (!name) return ""
  const emojiCode = getFlagCodeFromEmoji(name)
  if (emojiCode) return emojiCode

  const normalized = name.normalize("NFKC").toUpperCase()
  for (const [code, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (hasLatinToken(normalized, code)) return code
    if (
      aliases.some((alias) => {
        const normalizedAlias = alias.normalize("NFKC").toUpperCase()
        return /^[A-Z]+$/.test(normalizedAlias)
          ? hasLatinToken(normalized, normalizedAlias)
          : normalized.includes(normalizedAlias)
      })
    ) {
      return code
    }
  }

  for (const [code, regionName] of regionNameMatches) {
    if (normalized.includes(regionName)) return code
  }

  for (const code of flagCodes) {
    if (hasLatinToken(normalized, code)) return code
  }

  return ""
}

export function getFlagEmoji(code: string): string {
  const normalized = code.normalize("NFKC").toUpperCase()
  if (!COUNTRY_CODE_PATTERN.test(normalized)) return ""
  return Array.from(normalized)
    .map((char) =>
      String.fromCodePoint(REGION_INDICATOR_BASE + char.charCodeAt(0) - 65)
    )
    .join("")
}
