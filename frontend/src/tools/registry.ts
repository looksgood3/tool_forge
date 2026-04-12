import type { ToolMeta } from '@/stores/tools'
import type { ComponentType } from 'react'

import Base64Text from './base64-text'
import { meta as base64TextMeta } from './base64-text/meta'

import Base64Image from './base64-image'
import { meta as base64ImageMeta } from './base64-image/meta'

import UrlCodec from './url-codec'
import { meta as urlCodecMeta } from './url-codec/meta'

import UnicodeCodec from './unicode-codec'
import { meta as unicodeCodecMeta } from './unicode-codec/meta'

import NumberBase from './number-base'
import { meta as numberBaseMeta } from './number-base/meta'

import Timestamp from './timestamp'
import { meta as timestampMeta } from './timestamp/meta'

import JwtDecode from './jwt-decode'
import { meta as jwtDecodeMeta } from './jwt-decode/meta'

import Color from './color'
import { meta as colorMeta } from './color/meta'

import Uuid from './uuid'
import { meta as uuidMeta } from './uuid/meta'

import Hash from './hash'
import { meta as hashMeta } from './hash/meta'

import QrCodeTool from './qrcode'
import { meta as qrcodeMeta } from './qrcode/meta'

import JsonToGo from './json-to-go'
import { meta as jsonToGoMeta } from './json-to-go/meta'

import CurlConvert from './curl-convert'
import { meta as curlConvertMeta } from './curl-convert/meta'

export interface ToolEntry {
  meta: ToolMeta
  Component: ComponentType
}

export const tools: ToolEntry[] = [
  { meta: jsonToGoMeta, Component: JsonToGo },
  { meta: base64TextMeta, Component: Base64Text },
  { meta: base64ImageMeta, Component: Base64Image },
  { meta: urlCodecMeta, Component: UrlCodec },
  { meta: unicodeCodecMeta, Component: UnicodeCodec },
  { meta: numberBaseMeta, Component: NumberBase },
  { meta: timestampMeta, Component: Timestamp },
  { meta: jwtDecodeMeta, Component: JwtDecode },
  { meta: colorMeta, Component: Color },
  { meta: uuidMeta, Component: Uuid },
  { meta: hashMeta, Component: Hash },
  { meta: qrcodeMeta, Component: QrCodeTool },
  { meta: curlConvertMeta, Component: CurlConvert },
]

export const toolRegistry: ToolMeta[] = tools.map((t) => t.meta)

export function getToolComponent(id: string): ComponentType | undefined {
  return tools.find((t) => t.meta.id === id)?.Component
}
