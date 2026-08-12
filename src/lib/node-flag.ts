/**
 * Infer a country flag emoji from a proxy node display name / tag.
 *
 * Matching order (first hit wins within each tier):
 * 1. Chinese country / region names
 * 2. English country names (longer phrases first)
 * 3. Common airport / city codes as whole tokens
 * 4. ISO 3166-1 alpha-2 codes as whole tokens (SG-SIN, US_LAX, [JP], …)
 *
 * Short codes never match as substrings inside words (avoids "us" in "business").
 */

const DEFAULT_FLAG = "🌐"

type FlagRule = {
  flag: string
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
const FLAG_RULES: FlagRule[] = [
  // Greater China
  { flag: "🇭🇰", zh: ["香港"], en: ["hong kong", "hongkong"], codes: ["hk", "hkg"] },
  { flag: "🇲🇴", zh: ["澳门", "澳門"], en: ["macau", "macao"], codes: ["mo", "mfm"] },
  { flag: "🇹🇼", zh: ["台湾", "台灣", "臺湾"], en: ["taiwan", "taipei"], codes: ["tw", "tpe", "tsa", "khh"] },
  { flag: "🇨🇳", zh: ["中国", "大陸", "大陆", "内地"], en: ["china", "mainland"], codes: ["cn", "sha", "pvg", "pek", "can", "szx"] },

  // East / SE Asia
  {
    flag: "🇯🇵",
    zh: ["日本"],
    en: ["japan", "tokyo", "osaka", "nagoya", "fukuoka"],
    codes: ["jp", "nrt", "hnd", "kix", "itm", "ngo", "fuk", "tyo"],
  },
  {
    flag: "🇰🇷",
    zh: ["韩国", "韓國", "南韩", "南韓"],
    en: ["korea", "seoul", "busan"],
    codes: ["kr", "icn", "gmp", "pus"],
  },
  {
    flag: "🇸🇬",
    zh: ["新加坡"],
    en: ["singapore"],
    codes: ["sg", "sin"],
  },
  {
    flag: "🇲🇾",
    zh: ["马来西亚", "馬來西亞", "马来"],
    en: ["malaysia", "kuala lumpur"],
    codes: ["my", "kul"],
  },
  {
    flag: "🇹🇭",
    zh: ["泰国", "泰國"],
    en: ["thailand", "bangkok"],
    codes: ["th", "bkk"],
  },
  {
    flag: "🇻🇳",
    zh: ["越南"],
    en: ["vietnam", "ho chi minh", "hanoi"],
    codes: ["vn", "sgn", "han"],
  },
  {
    flag: "🇵🇭",
    zh: ["菲律宾", "菲律賓"],
    en: ["philippines", "manila"],
    codes: ["ph", "mnl"],
  },
  {
    flag: "🇮🇩",
    zh: ["印尼", "印度尼西亚", "印度尼西亞"],
    en: ["indonesia", "jakarta"],
    codes: ["id", "cgk"],
  },
  {
    flag: "🇮🇳",
    zh: ["印度"],
    en: ["india", "mumbai", "delhi", "bangalore"],
    codes: ["in", "bom", "del", "blr"],
  },

  // Americas
  {
    flag: "🇺🇸",
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
    flag: "🇨🇦",
    zh: ["加拿大"],
    en: ["canada", "toronto", "vancouver", "montreal"],
    codes: ["ca", "yyz", "yvr", "yul"],
  },
  {
    flag: "🇧🇷",
    zh: ["巴西"],
    en: ["brazil", "sao paulo"],
    codes: ["br", "gru"],
  },
  {
    flag: "🇦🇷",
    zh: ["阿根廷"],
    en: ["argentina", "buenos aires"],
    codes: ["ar", "eze"],
  },
  {
    flag: "🇲🇽",
    zh: ["墨西哥"],
    en: ["mexico"],
    codes: ["mx", "mex"],
  },

  // Europe
  {
    flag: "🇬🇧",
    zh: ["英国", "英國"],
    en: ["united kingdom", "britain", "england", "london"],
    codes: ["uk", "gb", "lhr", "lgw", "man"],
  },
  {
    flag: "🇩🇪",
    zh: ["德国", "德國"],
    en: ["germany", "frankfurt", "berlin", "munich"],
    codes: ["de", "fra", "ber", "muc"],
  },
  {
    flag: "🇫🇷",
    zh: ["法国", "法國"],
    en: ["france", "paris"],
    codes: ["fr", "cdg", "ory"],
  },
  {
    flag: "🇳🇱",
    zh: ["荷兰", "荷蘭"],
    en: ["netherlands", "holland", "amsterdam"],
    codes: ["nl", "ams"],
  },
  {
    flag: "🇮🇹",
    zh: ["意大利"],
    en: ["italy", "milan", "rome"],
    codes: ["it", "mxp", "fco"],
  },
  {
    flag: "🇪🇸",
    zh: ["西班牙"],
    en: ["spain", "madrid", "barcelona"],
    codes: ["es", "mad", "bcn"],
  },
  {
    flag: "🇨🇭",
    zh: ["瑞士"],
    en: ["switzerland", "zurich", "geneva"],
    codes: ["ch", "zrh", "gva"],
  },
  {
    flag: "🇸🇪",
    zh: ["瑞典"],
    en: ["sweden", "stockholm"],
    codes: ["se", "arn"],
  },
  {
    flag: "🇳🇴",
    zh: ["挪威"],
    en: ["norway", "oslo"],
    codes: ["no", "osl"],
  },
  {
    flag: "🇫🇮",
    zh: ["芬兰", "芬蘭"],
    en: ["finland", "helsinki"],
    codes: ["fi", "hel"],
  },
  {
    flag: "🇵🇱",
    zh: ["波兰", "波蘭"],
    en: ["poland", "warsaw"],
    codes: ["pl", "waw"],
  },
  {
    flag: "🇮🇪",
    zh: ["爱尔兰", "愛爾蘭"],
    en: ["ireland", "dublin"],
    codes: ["ie", "dub"],
  },
  {
    flag: "🇷🇺",
    zh: ["俄罗斯", "俄羅斯"],
    en: ["russia", "moscow"],
    codes: ["ru", "svo", "dme"],
  },
  {
    flag: "🇹🇷",
    zh: ["土耳其"],
    en: ["turkey", "istanbul"],
    codes: ["tr", "ist"],
  },

  // Oceania / Middle East / Africa
  {
    flag: "🇦🇺",
    zh: ["澳大利亚", "澳洲", "澳大利亞"],
    en: ["australia", "sydney", "melbourne"],
    codes: ["au", "syd", "mel"],
  },
  {
    flag: "🇳🇿",
    zh: ["新西兰", "紐西蘭", "纽西兰"],
    en: ["new zealand", "auckland"],
    codes: ["nz", "akl"],
  },
  {
    flag: "🇦🇪",
    zh: ["阿联酋", "阿聯酋", "迪拜", "迪拜"],
    en: ["united arab emirates", "dubai", "abu dhabi"],
    codes: ["ae", "dxb", "auh"],
  },
  {
    flag: "🇮🇱",
    zh: ["以色列"],
    en: ["israel", "tel aviv"],
    codes: ["il", "tlv"],
  },
  {
    flag: "🇿🇦",
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
 * Return a flag emoji for the node name, or 🌐 when unknown.
 */
export function flagEmojiForNodeName(name: string | null | undefined): string {
  const raw = (name ?? "").trim()
  if (!raw) return DEFAULT_FLAG

  const lower = raw.toLowerCase()

  // Pass 1: Chinese names (order in FLAG_RULES = priority).
  for (const rule of FLAG_RULES) {
    if (matchChinese(raw, rule.zh)) return rule.flag
  }

  // Pass 2: English country / city phrases (longer phrases listed first in rules).
  // Sort candidate phrases by length desc across all rules to prefer "hong kong" over "ko".
  const enHits: { flag: string; len: number }[] = []
  for (const rule of FLAG_RULES) {
    for (const phrase of rule.en ?? []) {
      const p = phrase.toLowerCase()
      if (lower.includes(p)) {
        enHits.push({ flag: rule.flag, len: p.length })
      }
    }
  }
  if (enHits.length > 0) {
    enHits.sort((a, b) => b.len - a.len)
    return enHits[0]!.flag
  }

  // Pass 3: whole-token ISO / airport codes — first rule in list that owns a token wins.
  const tokens = new Set(extractTokens(raw))
  if (tokens.size > 0) {
    for (const rule of FLAG_RULES) {
      for (const code of rule.codes ?? []) {
        if (tokens.has(code.toLowerCase())) {
          return rule.flag
        }
      }
    }
  }

  return DEFAULT_FLAG
}

export const NODE_FLAG_FALLBACK = DEFAULT_FLAG
