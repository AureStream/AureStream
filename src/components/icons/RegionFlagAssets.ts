import ae from "flag-icons/flags/4x3/ae.svg"
import ar from "flag-icons/flags/4x3/ar.svg"
import au from "flag-icons/flags/4x3/au.svg"
import br from "flag-icons/flags/4x3/br.svg"
import ca from "flag-icons/flags/4x3/ca.svg"
import ch from "flag-icons/flags/4x3/ch.svg"
import cn from "flag-icons/flags/4x3/cn.svg"
import de from "flag-icons/flags/4x3/de.svg"
import es from "flag-icons/flags/4x3/es.svg"
import fi from "flag-icons/flags/4x3/fi.svg"
import fr from "flag-icons/flags/4x3/fr.svg"
import gb from "flag-icons/flags/4x3/gb.svg"
import hk from "flag-icons/flags/4x3/hk.svg"
import id from "flag-icons/flags/4x3/id.svg"
import ie from "flag-icons/flags/4x3/ie.svg"
import il from "flag-icons/flags/4x3/il.svg"
import inFlag from "flag-icons/flags/4x3/in.svg"
import it from "flag-icons/flags/4x3/it.svg"
import jp from "flag-icons/flags/4x3/jp.svg"
import kr from "flag-icons/flags/4x3/kr.svg"
import mo from "flag-icons/flags/4x3/mo.svg"
import mx from "flag-icons/flags/4x3/mx.svg"
import my from "flag-icons/flags/4x3/my.svg"
import nl from "flag-icons/flags/4x3/nl.svg"
import no from "flag-icons/flags/4x3/no.svg"
import nz from "flag-icons/flags/4x3/nz.svg"
import ph from "flag-icons/flags/4x3/ph.svg"
import pl from "flag-icons/flags/4x3/pl.svg"
import ru from "flag-icons/flags/4x3/ru.svg"
import se from "flag-icons/flags/4x3/se.svg"
import sg from "flag-icons/flags/4x3/sg.svg"
import th from "flag-icons/flags/4x3/th.svg"
import tr from "flag-icons/flags/4x3/tr.svg"
import tw from "flag-icons/flags/4x3/tw.svg"
import un from "flag-icons/flags/4x3/un.svg"
import us from "flag-icons/flags/4x3/us.svg"
import vn from "flag-icons/flags/4x3/vn.svg"
import za from "flag-icons/flags/4x3/za.svg"

const REGION_FLAG_ASSETS: Record<string, string> = {
  AE: ae,
  AR: ar,
  AU: au,
  BR: br,
  CA: ca,
  CH: ch,
  CN: cn,
  DE: de,
  ES: es,
  FI: fi,
  FR: fr,
  GB: gb,
  HK: hk,
  ID: id,
  IE: ie,
  IL: il,
  IN: inFlag,
  IT: it,
  JP: jp,
  KR: kr,
  MO: mo,
  MX: mx,
  MY: my,
  NL: nl,
  NO: no,
  NZ: nz,
  PH: ph,
  PL: pl,
  RU: ru,
  SE: se,
  SG: sg,
  TH: th,
  TR: tr,
  TW: tw,
  US: us,
  VN: vn,
  ZA: za,
}

export function flagAssetForRegionCode(code: string): string {
  return REGION_FLAG_ASSETS[code] ?? un
}
