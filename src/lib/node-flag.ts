/**
 * Infer a stable two-letter region code from a proxy node display name / tag.
 *
 * Matching order (first hit wins within each tier):
 * 1. Chinese country / region names
 * 2. English country names (longer phrases first)
 * 3. Common airport / city codes as whole tokens
 * 4. ISO 3166-1 alpha-2 codes as whole tokens (SG-SIN, US_LAX, [JP], …)
 *
 * Short codes never match as substrings inside words (avoids "us" in "business").
 */

const DEFAULT_REGION_CODE = "GL"

type RegionRule = {
  code: string
  /** Case-sensitive substrings (typically Chinese). */
  zh?: string[]
  /** Case-insensitive English phrases; longer first is recommended. */
  en?: string[]
  /** Whole tokens: airport/city codes and ISO alpha-2. Matched case-insensitively. */
  codes?: string[]
}

/**
 * Rules ordered by specificity. Within a rule, Chinese → English → codes.
 * Across rules, earlier entries win when scanning name for Chinese/English;
 * codes are resolved via the first matching token against this list order.
 */
const REGION_RULES: RegionRule[] = [
  // Greater China
  { code: "HK", zh: ["香港"], en: ["hong kong", "hongkong"], codes: ["hk", "hkg"] },
  { code: "MO", zh: ["澳门", "澳門"], en: ["macau", "macao"], codes: ["mo", "mfm"] },
  { code: "TW", zh: ["台湾", "台灣", "臺湾"], en: ["taiwan", "taipei"], codes: ["tw", "tpe", "tsa", "khh"] },
  { code: "CN", zh: ["中国", "大陸", "大陆", "内地"], en: ["china", "mainland"], codes: ["cn", "sha", "pvg", "pek", "can", "szx"] },

  // East / SE Asia
  {
    code: "JP",
    zh: ["日本"],
    en: ["japan", "tokyo", "osaka", "nagoya", "fukuoka"],
    codes: ["jp", "nrt", "hnd", "kix", "itm", "ngo", "fuk", "tyo"],
  },
  {
    code: "KR",
    zh: ["韩国", "韓國", "南韩", "南韓"],
    en: ["korea", "seoul", "busan"],
    codes: ["kr", "icn", "gmp", "pus"],
  },
  {
    code: "SG",
    zh: ["新加坡"],
    en: ["singapore"],
    codes: ["sg", "sin"],
  },
  {
    code: "MY",
    zh: ["马来西亚", "馬來西亞", "马来"],
    en: ["malaysia", "kuala lumpur"],
    codes: ["my", "kul"],
  },
  {
    code: "TH",
    zh: ["泰国", "泰國"],
    en: ["thailand", "bangkok"],
    codes: ["th", "bkk"],
  },
  {
    code: "VN",
    zh: ["越南"],
    en: ["vietnam", "ho chi minh", "hanoi"],
    codes: ["vn", "sgn", "han"],
  },
  {
    code: "PH",
    zh: ["菲律宾", "菲律賓"],
    en: ["philippines", "manila"],
    codes: ["ph", "mnl"],
  },
  {
    code: "ID",
    zh: ["印尼", "印度尼西亚", "印度尼西亞"],
    en: ["indonesia", "jakarta"],
    codes: ["id", "cgk"],
  },
  {
    code: "IN",
    zh: ["印度"],
    en: ["india", "mumbai", "delhi", "bangalore"],
    codes: ["in", "bom", "del", "blr"],
  },

  // Americas
  {
    code: "US",
    zh: ["美国", "美國"],
    en: [
      "united states",
      "america",
      "los angeles",
      "san jose",
      "san francisco",
      "new york",
      "seattle",
      "chicago",
      "dallas",
      "miami",
      "atlanta",
      "ashburn",
    ],
    codes: ["us", "usa", "lax", "sjc", "sfo", "nyc", "ewr", "jfk", "iad", "sea", "ord", "dfw", "mia", "atl"],
  },
  {
    code: "CA",
    zh: ["加拿大"],
    en: ["canada", "toronto", "vancouver", "montreal"],
    codes: ["ca", "yyz", "yvr", "yul"],
  },
  {
    code: "BR",
    zh: ["巴西"],
    en: ["brazil", "sao paulo"],
    codes: ["br", "gru"],
  },
  {
    code: "AR",
    zh: ["阿根廷"],
    en: ["argentina", "buenos aires"],
    codes: ["ar", "eze"],
  },
  {
    code: "MX",
    zh: ["墨西哥"],
    en: ["mexico"],
    codes: ["mx", "mex"],
  },

  // Europe
  {
    code: "GB",
    zh: ["英国", "英國"],
    en: ["united kingdom", "britain", "england", "london"],
    codes: ["uk", "gb", "lhr", "lgw", "man"],
  },
  {
    code: "DE",
    zh: ["德国", "德國"],
    en: ["germany", "frankfurt", "berlin", "munich"],
    codes: ["de", "fra", "ber", "muc"],
  },
  {
    code: "FR",
    zh: ["法国", "法國"],
    en: ["france", "paris"],
    codes: ["fr", "cdg", "ory"],
  },
  {
    code: "NL",
    zh: ["荷兰", "荷蘭"],
    en: ["netherlands", "holland", "amsterdam"],
    codes: ["nl", "ams"],
  },
  {
    code: "IT",
    zh: ["意大利"],
    en: ["italy", "milan", "rome"],
    codes: ["it", "mxp", "fco"],
  },
  {
    code: "ES",
    zh: ["西班牙"],
    en: ["spain", "madrid", "barcelona"],
    codes: ["es", "mad", "bcn"],
  },
  {
    code: "CH",
    zh: ["瑞士"],
    en: ["switzerland", "zurich", "geneva"],
    codes: ["ch", "zrh", "gva"],
  },
  {
    code: "SE",
    zh: ["瑞典"],
    en: ["sweden", "stockholm"],
    codes: ["se", "arn"],
  },
  {
    code: "NO",
    zh: ["挪威"],
    en: ["norway", "oslo"],
    codes: ["no", "osl"],
  },
  {
    code: "FI",
    zh: ["芬兰", "芬蘭"],
    en: ["finland", "helsinki"],
    codes: ["fi", "hel"],
  },
  {
    code: "PL",
    zh: ["波兰", "波蘭"],
    en: ["poland", "warsaw"],
    codes: ["pl", "waw"],
  },
  {
    code: "IE",
    zh: ["爱尔兰", "愛爾蘭"],
    en: ["ireland", "dublin"],
    codes: ["ie", "dub"],
  },
  {
    code: "RU",
    zh: ["俄罗斯", "俄羅斯"],
    en: ["russia", "moscow"],
    codes: ["ru", "svo", "dme"],
  },
  {
    code: "TR",
    zh: ["土耳其"],
    en: ["turkey", "istanbul"],
    codes: ["tr", "ist"],
  },

  // Oceania / Middle East / Africa
  {
    code: "AU",
    zh: ["澳大利亚", "澳洲", "澳大利亞"],
    en: ["australia", "sydney", "melbourne"],
    codes: ["au", "syd", "mel"],
  },
  {
    code: "NZ",
    zh: ["新西兰", "紐西蘭", "纽西兰"],
    en: ["new zealand", "auckland"],
    codes: ["nz", "akl"],
  },
  {
    code: "AE",
    zh: ["阿联酋", "阿聯酋", "迪拜", "迪拜"],
    en: ["united arab emirates", "dubai", "abu dhabi"],
    codes: ["ae", "dxb", "auh"],
  },
  {
    code: "IL",
    zh: ["以色列"],
    en: ["israel", "tel aviv"],
    codes: ["il", "tlv"],
  },
  {
    code: "ZA",
    zh: ["南非"],
    en: ["south africa", "johannesburg"],
    codes: ["za", "jnb"],
  },
]

/** Split name into alphanumeric tokens (ascii + keep CJK separately via includes). */
function extractTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2)
}

function matchChinese(name: string, needles: string[] | undefined): boolean {
  if (!needles?.length) return false
  return needles.some((n) => name.includes(n))
}

/**
 * Return an ISO-style region code for the node name, or GL when unknown.
 */
export function regionCodeForNodeName(name: string | null | undefined): string {
  const raw = (name ?? "").trim()
  if (!raw) return DEFAULT_REGION_CODE

  const lower = raw.toLowerCase()

  // Pass 1: Chinese names (order in REGION_RULES = priority).
  for (const rule of REGION_RULES) {
    if (matchChinese(raw, rule.zh)) return rule.code
  }

  // Pass 2: English country / city phrases (longer phrases listed first in rules).
  // Sort candidate phrases by length desc across all rules to prefer "hong kong" over "ko".
  const enHits: { code: string; len: number }[] = []
  for (const rule of REGION_RULES) {
    for (const phrase of rule.en ?? []) {
      const p = phrase.toLowerCase()
      if (lower.includes(p)) {
        enHits.push({ code: rule.code, len: p.length })
      }
    }
  }
  if (enHits.length > 0) {
    enHits.sort((a, b) => b.len - a.len)
    return enHits[0]!.code
  }

  // Pass 3: whole-token ISO / airport codes — first rule in list that owns a token wins.
  const tokens = new Set(extractTokens(raw))
  if (tokens.size > 0) {
    for (const rule of REGION_RULES) {
      for (const code of rule.codes ?? []) {
        if (tokens.has(code.toLowerCase())) {
          return rule.code
        }
      }
    }
  }

  return DEFAULT_REGION_CODE
}

export const NODE_REGION_FALLBACK = DEFAULT_REGION_CODE
