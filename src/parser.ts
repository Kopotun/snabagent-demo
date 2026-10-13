import { AMBIGUOUS, MAT, MATERIALS, OBJECTS, type UnitCode } from './data'

// Детерминированный разбор заявки для прототипа.
// В рабочей системе первый шаг делает LLM, а этот разбор остаётся запасным (R1-BOT-15).

export interface ParsedLine {
  raw: string
  mat?: string
  options?: string[] // неоднозначный материал — спросить кнопками
  qtyInput: number
  unitInput?: UnitCode
  qty: number // в базовой единице (если материал известен)
}

export interface ParsedRequest {
  objectId?: string
  lines: ParsedLine[]
}

const ONES: Record<string, number> = {
  ноль: 0, один: 1, одна: 1, одну: 1, одного: 1, два: 2, две: 2, двух: 2, три: 3, трех: 3, четыре: 4, четырех: 4,
  пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12,
  тринадцать: 13, четырнадцать: 14, пятнадцать: 15, шестнадцать: 16, семнадцать: 17, восемнадцать: 18,
  девятнадцать: 19, двадцать: 20, тридцать: 30, сорок: 40, пятьдесят: 50, шестьдесят: 60, семьдесят: 70,
  восемьдесят: 80, девяносто: 90, сто: 100, двести: 200, триста: 300, четыреста: 400, пятьсот: 500,
  шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900, тысяча: 1000, тысячу: 1000,
  пару: 2, пара: 2, пары: 2, полтора: 1.5, полторы: 1.5, десяток: 10, десятка: 10,
}

const UNIT_WORDS: [RegExp, UnitCode][] = [
  [/^(шт|штук[а-я]*)$/, 'шт'],
  [/^(баллон[а-я]*|бутыл[а-я]*|банк[а-я]*)$/, 'шт'],
  [/^(куб|куба|кубов|кубы|кубометр[а-я]*|м3|м³)$/, 'м³'],
  [/^(кг|кило|килограмм[а-я]*)$/, 'кг'],
  [/^(т|тонн[а-я]*)$/, 'т'],
  [/^(мешок|мешка|мешков|мешки)$/, 'мешок'],
  [/^(лист|листа|листов|листы)$/, 'лист'],
  [/^(рулон|рулона|рулонов|рулоны)$/, 'рулон'],
  [/^(л|литр|литра|литров)$/, 'л'],
  [/^(канистр[а-я]*)$/, 'канистра'],
  [/^(уп|упак[а-я]*|пачк[а-я]*|пачек|коробк[а-я]*|коробок)$/, 'уп'],
  [/^(м2|м²|квадрат[а-я]*)$/, 'м²'],
  [/^(м|метр|метра|метров|погонн[а-я]*)$/, 'м'],
]

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(\d)\s*[xх*×]\s*(\d)/g, '$1×$2')
    .replace(/[«»"()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function unitOf(w: string): UnitCode | undefined {
  for (const [r, u] of UNIT_WORDS) if (r.test(w)) return u
  return undefined
}

export function detectObject(text: string): string | undefined {
  const t = normalize(text)
  return OBJECTS.find(o => o.aliases.some(a => a.test(t)))?.id
}

function stripObject(t: string): string {
  let out = t
  for (const o of OBJECTS)
    for (const a of o.aliases) out = out.replace(new RegExp(`(на\\s+|для\\s+)?${a.source}\\s*:?`, 'g'), ' ')
  return out
}

export function findMaterial(chunk: string): { mat?: string; options?: string[] } {
  const c = normalize(chunk)
  for (const m of MATERIALS) if (m.aliases.some(a => a.test(c))) return { mat: m.id }
  for (const amb of AMBIGUOUS) if (amb.re.test(c)) return { options: amb.options }
  return {}
}

const SIZE_AFTER_NAME =
  /(брус[а-я]*|доск[а-я]*|пен[а-я]*|осп-?|арматур[а-я]*|саморез[а-я]*)\s+(\d+(?:[.,]\d+)?)(?!\s*(шт|штук|кг|м³|м3|куб|лист|рулон|мешок|мешк|баллон|уп|пач|литр))/g

// Количество: первое число или числительное, которое не является размером
function findQty(chunk: string): { qty?: number; unit?: UnitCode } {
  let c = chunk
    .replace(/\d+(?:[.,]\d+)?(?:×\d+(?:[.,]\d+)?)+/g, ' ') // 150×150, 4,5×70
    .replace(/\d+(?:[.,]\d+)?\s*(мм|см|мл)(?![а-я])/g, ' ') // 12 мм, 750 мл
    .replace(/сто\s+пятьдесят\s+на\s+сто\s+пятьдесят/g, ' ')
    .replace(/\d+\s+на\s+\d+/g, ' ') // 150 на 150
  if (/брус|доск|пятидесятк|двадцатипятк/.test(c)) c = c.replace(/\d+\s*(м|метр[а-я]*)(?![а-я0-9²³])/g, ' ') // 6 м — длина
  c = c.replace(SIZE_AFTER_NAME, '$1') // брус 150, пена 750

  const tokens = c.replace(/(?<!\d)[.!?:]|[.!?:](?!\d)/g, ' ').split(/\s+/).filter(Boolean)
  let qty: number | undefined
  let unit: UnitCode | undefined
  let qtyIdx = -1
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i]
    if (/^\d+(?:[.,]\d+)?$/.test(tk)) { qty = parseFloat(tk.replace(',', '.')); qtyIdx = i; break }
    if (tk in ONES) {
      // составные числительные: «двадцать пять», «сто двадцать»
      let v = ONES[tk]
      let j = i + 1
      while (j < tokens.length && tokens[j] in ONES && ONES[tokens[j]] < v && ONES[tokens[j]] >= 1) { v += ONES[tokens[j]]; j++ }
      qty = v; qtyIdx = j - 1; break
    }
  }
  const near = qtyIdx >= 0 ? [tokens[qtyIdx + 1], tokens[qtyIdx - 1]].filter(Boolean) : []
  for (const w of near) { const u = unitOf(w); if (u) { unit = u; break } }
  if (!unit) for (const w of tokens) { const u = unitOf(w); if (u) { unit = u; break } }
  // «мешок гвоздей», «рулон мембраны» без числа — это одна штука
  if (qty === undefined && unit && /^(мешок|рулон|лист|канистра|уп)$/.test(unit)) qty = 1
  return { qty, unit }
}

export function round(v: number, unit: UnitCode): number {
  const precise = unit === 'м³' || unit === 'т' || unit === 'кг' || unit === 'л'
  return precise ? Math.round(v * 100) / 100 : Math.round(v)
}

export function toBase(matId: string, qtyInput: number, unit?: UnitCode): number {
  const m = MAT[matId]
  if (!unit || unit === m.unit) return qtyInput
  const f = m.units?.[unit]
  if (f) return round(qtyInput * f, m.unit)
  return qtyInput // коэффициент неизвестен: в прототипе считаем в базовой единице
}

export function parseRequest(text: string): ParsedRequest {
  const objectId = detectObject(text)
  const t = stripObject(normalize(text)).replace(/^\s*(нужно|надо|нужны|нужен|прошу|привезите|заявка)\s*:?\s*/, '')
  const chunks = t
    .split(/(?<!\d),|,(?!\d)|;|\n|\s\+\s|\s(?:и|плюс|еще|также)\s/)
    .map(s => s.replace(/^[\s.:—-]+|[\s.:—-]+$/g, '').replace(/^(нужно|надо|еще|и)\s+/, '').trim())
    .filter(s => s.length > 1)

  const lines: ParsedLine[] = []
  for (const raw of chunks) {
    const { mat, options } = findMaterial(raw)
    const { qty, unit } = findQty(raw)
    if (!mat && !options && qty === undefined) continue // «спасибо», «привет» и т.п.
    const qtyInput = qty ?? 1
    lines.push({ raw, mat, options, qtyInput, unitInput: unit, qty: mat ? toBase(mat, qtyInput, unit) : qtyInput })
  }
  return { objectId, lines }
}

// Правка черновика: «брус 18», «убери пену», «добавь уголки 120»
export type EditOp =
  | { op: 'remove'; mat?: string; options?: string[] }
  | { op: 'upsert'; line: ParsedLine }

export function parseEdit(text: string): EditOp[] {
  const t = normalize(text)
  const rm = t.match(/^(убери|убрать|удали|удалить|не надо|не нужно|без)\s+(.+)$/)
  if (rm) return rm[2].split(/,|\sи\s/).map(s => ({ op: 'remove' as const, ...findMaterial(s.trim()) }))
  const cleaned = t.replace(/^(добавь|добавить|плюс|еще|исправь|поменяй|измени)\s+/, '')
  return cleaned
    .split(/(?<!\d),|,(?!\d)|;|\s(?:и|плюс)\s/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(raw => {
      const full = parseRequest(raw).lines[0]
      // в правке количество — последнее число: «брус 18», «брус 150 — 18 шт»
      const nums = raw.match(/\d+(?:[.,]\d+)?/g)
      const last = nums ? parseFloat(nums[nums.length - 1].replace(',', '.')) : undefined
      const qtyInput = full?.unitInput || !last ? (full?.qtyInput ?? 1) : last
      const { mat, options } = full ?? findMaterial(raw)
      return {
        op: 'upsert' as const,
        line: { raw, mat, options, qtyInput, unitInput: full?.unitInput, qty: mat ? toBase(mat, qtyInput, full?.unitInput) : qtyInput },
      }
    })
}

// Корень первого слова названия — чтобы «брус 18» нашёл строку «Брус 150×150×6000» в черновике
export function nameRoot(matId: string): string {
  return normalize(MAT[matId].name).split(' ')[0].slice(0, 4)
}

export function num(v: number): string {
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

const SHORT: Partial<Record<UnitCode, string>> = { 'рулон': 'рул.', 'лист': 'лист.', 'мешок': 'меш.', 'канистра': 'кан.' }
export function unitLabel(unit: UnitCode): string {
  return SHORT[unit] ?? unit
}
export function fmtQty(v: number, unit: UnitCode): string {
  return `${num(v)} ${unitLabel(unit)}`
}

export function rub(v: number): string {
  return `${Math.round(v).toLocaleString('ru-RU')} ₽`
}
