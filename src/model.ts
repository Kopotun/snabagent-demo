import { MAT, OBJ, OBJECTS, PROJECT, SETTINGS, type UnitCode } from './data'
import { round } from './parser'

// ---------- Типы ----------

export type Zone = 'green' | 'yellow' | 'red'
export type Approval = 'none' | 'pending' | 'approved' | 'reduced' | 'rejected' | 'retro'

export interface ReqLine {
  id: string
  reqNo: number
  objectId: string
  stage: number
  mat: string
  qty: number // в базовой единице
  qtyInput: number
  unitInput?: UnitCode
  raw: string
  zone: Zone
  normAt: number
  remainingAt: number
  over: number
  overRub: number
  approval: Approval
  approvedOver?: number
  reason?: string
  comment?: string
  ordered: number
  received: number
  urgent: boolean
  demo: boolean
  at: string
}

export interface Req {
  no: number
  objectId: string
  author: string
  source: 'text' | 'template' | 'seed'
  raw: string
  at: string
  urgent: boolean
  demo: boolean
}

export interface OrderLine { mat: string; qty: number; price: number; allocs: { lineId: string; objectId: string; qty: number }[] }
export interface Order { no: number; supplierId: string; status: 'sent' | 'shipped'; at: string; lines: OrderLine[]; demo: boolean }

export interface ShipLine { mat: string; qty: number; accepted: number; allocs: { lineId: string; qty: number }[] }
export interface Shipment {
  id: string
  orderNo?: number
  transferFrom?: string
  objectId: string
  status: 'expected' | 'accepted' | 'discrepancy'
  lines: ShipLine[]
  photo: boolean
  at: string
}

export interface Move {
  objectId: string
  mat: string
  qty: number
  type: 'receipt' | 'consumption' | 'transfer_in' | 'transfer_out'
  stage?: number
  cost: number // ₽ за базовую единицу
  at: string
}

export interface Variance {
  id: string
  kind: 'order' | 'over' | 'saving'
  objectId: string
  stage: number
  mat: string
  qty: number
  rub: number
  reason?: string
  comment?: string
  demo: boolean
  at: string
}

export interface CloseRow { mat: string; before: number; norm: number; actual: number; consumption: number; deviation: number; confirmed: boolean }
export interface StageClose { objectId: string; stage: number; at: string; rows: CloseRow[]; demo: boolean }

export interface FeedEvent { at: string; objectId?: string; text: string; who: string }

export interface Btn { label: string; action: string; tone?: 'primary' | 'danger' | 'quiet' }

export interface DraftLine {
  key: string
  raw: string
  mat?: string
  options?: string[]
  qtyInput: number
  unitInput?: UnitCode
  qty: number
  stage: number
  note?: string
}
export interface Draft { objectId: string; lines: DraftLine[]; urgent: boolean; source: 'text' | 'template'; raw: string; forgottenAdded: boolean }

export type Card =
  | { type: 'draft'; draft: Draft; evals: Record<string, LineEval>; forgotten: [string, number][]; outdated?: boolean }
  | { type: 'approval'; lineId: string }
  | { type: 'shipment'; shipmentId: string }
  | { type: 'closing'; objectId: string; stage: number; rows: { mat: string; before: number; norm: number; expected: number }[] }
  | { type: 'list'; title: string; rows: { text: string; tone?: Zone | 'muted' }[] }

export interface Msg {
  id: string
  from: 'bot' | 'user'
  text?: string
  card?: Card
  buttons?: Btn[][]
  used?: boolean
  chosen?: string
  photo?: boolean
  time: string
}

export type ChatId = 'foreman' | 'director'

export type Flow =
  | { kind: 'idle' }
  | { kind: 'pickObject'; then: 'template' | 'close' | 'draft'; pendingText?: string }
  | { kind: 'reasons'; queue: string[]; idx: number; awaitingComment: boolean; reasons: Record<string, { code: string; comment?: string }> }
  | { kind: 'acceptPhoto'; shipmentId: string }
  | { kind: 'acceptDiscrepancy'; shipmentId: string }
  | { kind: 'closing'; objectId: string; stage: number; confirmShort?: boolean }
  | { kind: 'closingReasons'; objectId: string; stage: number; rows: CloseRow[]; queue: string[]; idx: number; reasons: Record<string, string> }

export type DirFlow = { kind: 'idle' } | { kind: 'reduce'; lineId: string }

export interface State {
  v: number
  lines: ReqLine[]
  reqs: Req[]
  orders: Order[]
  shipments: Shipment[]
  moves: Move[]
  variances: Variance[]
  closes: StageClose[]
  events: FeedEvent[]
  activeStage: Record<string, number>
  chats: Record<ChatId, Msg[]>
  typing: Record<ChatId, boolean>
  unread: Record<ChatId, number>
  draft: Draft | null
  draftMsgId?: string
  lastObject?: string
  flow: Flow
  dirFlow: DirFlow
  seq: { req: number; order: number; id: number }
  clock: number // минуты от 00:00 «сегодня» для отметок времени в чате
}

// ---------- Даты ----------

export function addDays(iso: string, d: number): string {
  const t = new Date(iso + 'T00:00:00Z')
  t.setUTCDate(t.getUTCDate() + d)
  return t.toISOString().slice(0, 10)
}
export function fmtDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}`
}
export function planStart(objectId: string, stage: number): string {
  const o = OBJ[objectId]
  let days = 0
  for (const st of PROJECT.stages) if (st.no < stage) days += st.days
  return addDays(o.start, days)
}
export function planFinish(objectId: string, stage: number): string {
  return addDays(planStart(objectId, stage), stageTpl(stage).days)
}
export function stageTpl(no: number) {
  return PROJECT.stages[no - 1]
}

// ---------- Нормы ----------

export function objNorm(objectId: string, stage: number): [string, number][] {
  const base = new Map<string, number>(stageTpl(stage).norm)
  for (const ch of OBJ[objectId].customerChanges ?? [])
    if (ch.stage === stage) base.set(ch.mat, round((base.get(ch.mat) ?? 0) + ch.delta, MAT[ch.mat].unit))
  return [...base.entries()]
}
export function normOf(objectId: string, stage: number, mat: string): number {
  return objNorm(objectId, stage).find(([m]) => m === mat)?.[1] ?? 0
}

// Эффективно заявленное по строке: минус отклонённая/урезанная часть перебора
export function effectiveQty(l: ReqLine): number {
  if (l.approval === 'rejected') return l.qty - l.over
  if (l.approval === 'reduced') return l.qty - l.over + (l.approvedOver ?? 0)
  return l.qty
}
// Сколько ещё можно включить в закупку
export function availableQty(l: ReqLine): number {
  const blocked = l.approval === 'pending' ? l.over : 0
  return Math.max(0, round(effectiveQty(l) - blocked - l.ordered, MAT[l.mat].unit))
}

export function requestedBefore(s: State, objectId: string, stage: number, mat: string): number {
  let sum = 0
  for (const l of s.lines) if (l.objectId === objectId && l.stage === stage && l.mat === mat) sum += effectiveQty(l)
  return round(sum, MAT[mat].unit)
}

export interface LineEval { norm: number; before: number; remaining: number; over: number; overRub: number; pct: number; zone: Zone }

export function evaluate(s: State, objectId: string, stage: number, mat: string, qty: number, extraBefore = 0): LineEval {
  const unit = MAT[mat].unit
  const norm = normOf(objectId, stage, mat)
  const before = round(requestedBefore(s, objectId, stage, mat) + extraBefore, unit)
  const remaining = round(norm - before, unit)
  const over = round(Math.max(0, qty - Math.max(remaining, 0)), unit)
  const overRub = over * MAT[mat].price
  const pct = norm > 0 ? over / norm : Infinity
  let zone: Zone = 'green'
  if (over > 0) {
    const small = overRub <= SETTINGS.smallRub
    const tolerable = pct <= SETTINGS.yellowPct && overRub <= SETTINGS.yellowRub
    zone = small || tolerable ? 'yellow' : 'red'
  }
  return { norm, before, remaining, over, overRub, pct, zone }
}

// Этап, к которому относим материал: текущий, если он там есть, иначе ближайший будущий
export function stageForMat(s: State, objectId: string, mat: string): { stage: number; moved: boolean } {
  const active = s.activeStage[objectId]
  if (normOf(objectId, active, mat) > 0) return { stage: active, moved: false }
  for (let st = active + 1; st <= PROJECT.stages.length; st++) if (normOf(objectId, st, mat) > 0) return { stage: st, moved: true }
  return { stage: active, moved: false }
}

export function forgotten(s: State, d: Draft): [string, number][] {
  const st = s.activeStage[d.objectId]
  const inDraft = new Set(d.lines.map(l => l.mat))
  return objNorm(d.objectId, st)
    .filter(([m]) => !inDraft.has(m) && requestedBefore(s, d.objectId, st, m) === 0)
}

// Оценка строк черновика с учётом повторов одного материала
export function evalDraft(s: State, d: Draft): Map<string, LineEval> {
  const acc = new Map<string, number>()
  const out = new Map<string, LineEval>()
  for (const l of d.lines) {
    if (!l.mat) continue
    const k = `${l.stage}:${l.mat}`
    const ev = evaluate(s, d.objectId, l.stage, l.mat, l.qty, acc.get(k) ?? 0)
    acc.set(k, (acc.get(k) ?? 0) + l.qty)
    out.set(l.key, ev)
  }
  return out
}

// ---------- Остатки и деньги ----------

export function balance(s: State, objectId: string, mat: string): number {
  let b = 0
  for (const m of s.moves) if (m.objectId === objectId && m.mat === mat) b += m.qty
  return round(b, MAT[mat].unit)
}

// Излишек на объекте: остаток минус то, что ещё понадобится этому дому по нормам незакрытых этапов
export function surplus(s: State, objectId: string, mat: string): number {
  const bal = balance(s, objectId, mat)
  if (bal <= 0) return 0
  let need = 0
  for (let st = s.activeStage[objectId]; st <= PROJECT.stages.length; st++) {
    const n = normOf(objectId, st, mat)
    if (!n) continue
    let got = 0
    for (const m of s.moves) if (m.objectId === objectId && m.mat === mat && m.stage === st && m.qty > 0) got += m.qty
    need += Math.max(0, n - got)
  }
  return Math.max(0, round(bal - need, MAT[mat].unit))
}

export interface StageStats {
  stage: number
  status: 'closed' | 'active' | 'planned'
  normRub: number
  requestedRub: number
  orderedRub: number
  receivedRub: number
  consumedRub: number
  overRub: number
  savingRub: number
  overCount: number
}

export function stageStats(s: State, objectId: string, stage: number): StageStats {
  const status = stage < s.activeStage[objectId] ? 'closed' : stage === s.activeStage[objectId] ? 'active' : 'planned'
  let normRub = 0, requestedRub = 0, orderedRub = 0, receivedRub = 0, consumedRub = 0, overRub = 0, savingRub = 0, overCount = 0
  for (const [m, n] of objNorm(objectId, stage)) normRub += n * MAT[m].price
  for (const l of s.lines) if (l.objectId === objectId && l.stage === stage) {
    requestedRub += effectiveQty(l) * MAT[l.mat].price
    orderedRub += l.ordered * MAT[l.mat].price
  }
  for (const mv of s.moves) if (mv.objectId === objectId && mv.stage === stage) {
    if (mv.type === 'receipt' || mv.type === 'transfer_in') receivedRub += mv.qty * mv.cost
    if (mv.type === 'consumption') consumedRub += -mv.qty * mv.cost
  }
  for (const v of s.variances) if (v.objectId === objectId && v.stage === stage) {
    if (v.kind === 'over') { overRub += v.rub; overCount++ }
    if (v.kind === 'saving') savingRub += v.rub
  }
  return { stage, status, normRub, requestedRub, orderedRub, receivedRub, consumedRub, overRub, savingRub, overCount }
}

export interface MatStats { mat: string; norm: number; requested: number; ordered: number; received: number; consumed: number; balance: number }

export function matStats(s: State, objectId: string, stage: number): MatStats[] {
  const mats = new Set(objNorm(objectId, stage).map(([m]) => m))
  for (const l of s.lines) if (l.objectId === objectId && l.stage === stage) mats.add(l.mat)
  return [...mats].map(mat => {
    let requested = 0, ordered = 0, received = 0, consumed = 0
    for (const l of s.lines) if (l.objectId === objectId && l.stage === stage && l.mat === mat) { requested += effectiveQty(l); ordered += l.ordered }
    for (const mv of s.moves) if (mv.objectId === objectId && mv.stage === stage && mv.mat === mat) {
      if (mv.type === 'receipt' || mv.type === 'transfer_in') received += mv.qty
      if (mv.type === 'consumption') consumed += -mv.qty
    }
    const u = MAT[mat].unit
    return {
      mat, norm: normOf(objectId, stage, mat), requested: round(requested, u), ordered: round(ordered, u),
      received: round(received, u), consumed: round(consumed, u), balance: balance(s, objectId, mat),
    }
  })
}

// ---------- Начальное состояние ----------

const FACTORS = [1, 1, 1.04, 1, 1.08, 0.98, 1.15, 1, 1.02, 1.1]
const SEED_REASONS = ['site_damage', 'supplier_defect', 'norm_error', 'site_damage', 'other']
const SEED_COMMENTS: Record<string, string> = { other: 'Пересорт по длине, часть ушла в обрезки' }

function hash(str: string): number {
  let h = 7
  for (const c of str) h = (h * 31 + c.charCodeAt(0)) % 100003
  return h
}

export function seed(): State {
  const s: State = {
    v: 1, lines: [], reqs: [], orders: [], shipments: [], moves: [], variances: [], closes: [], events: [],
    activeStage: Object.fromEntries(OBJECTS.map(o => [o.id, o.activeStage])),
    chats: { foreman: [], director: [] },
    typing: { foreman: false, director: false },
    unread: { foreman: 0, director: 0 },
    draft: null,
    flow: { kind: 'idle' },
    dirFlow: { kind: 'idle' },
    seq: { req: 201, order: 41, id: 1 },
    clock: 9 * 60 + 12,
  }
  let reasonIdx = 0
  const id = () => `s${s.seq.id++}`

  for (const o of OBJECTS) {
    const addReq = (stage: number, items: [string, number][], at: string, closed: boolean) => {
      const no = s.seq.req++
      s.reqs.push({ no, objectId: o.id, author: o.foreman, source: 'seed', raw: items.map(([m, q]) => `${MAT[m].name} — ${q} ${MAT[m].unit}`).join('; '), at, urgent: false, demo: false })
      for (const [mat, n] of items) {
        const unit = MAT[mat].unit
        const f = closed ? FACTORS[hash(o.id + stage + mat) % FACTORS.length] : 1
        const qty = closed ? round(n * f, unit) : n
        const norm = normOf(o.id, stage, mat)
        const over = closed ? round(Math.max(0, qty - norm), unit) : 0
        const reason = over > 0 ? SEED_REASONS[reasonIdx++ % SEED_REASONS.length] : undefined
        const lineId = id()
        s.lines.push({
          id: lineId, reqNo: no, objectId: o.id, stage, mat, qty, qtyInput: qty, unitInput: unit, raw: MAT[mat].name,
          zone: over > 0 ? (over * MAT[mat].price <= SETTINGS.smallRub ? 'yellow' : 'red') : 'green',
          normAt: norm, remainingAt: norm, over, overRub: over * MAT[mat].price,
          approval: over > 0 && over * MAT[mat].price > SETTINGS.smallRub ? 'approved' : 'none',
          reason, comment: reason ? SEED_COMMENTS[reason] : undefined,
          ordered: qty, received: qty, urgent: false, demo: false, at,
        })
        if (over > 0) s.variances.push({ id: id(), kind: 'order', objectId: o.id, stage, mat, qty: over, rub: over * MAT[mat].price, reason, comment: reason ? SEED_COMMENTS[reason] : undefined, demo: false, at })
        s.moves.push({ objectId: o.id, mat, qty, type: 'receipt', stage, cost: MAT[mat].price, at })
      }
    }

    for (let st = 1; st < o.activeStage; st++) {
      const at = planStart(o.id, st)
      const items = objNorm(o.id, st)
      addReq(st, items, at, true)
      // закрытие этапа: фактический остаток и расход
      const rows: CloseRow[] = []
      for (const [mat, n] of items) {
        const unit = MAT[mat].unit
        const got = s.moves.filter(m => m.objectId === o.id && m.mat === mat && m.stage === st).reduce((a, m) => a + m.qty, 0)
        const left = o.leftovers?.find(x => x.stage === st && x.mat === mat)?.qty ?? 0
        const consumption = round(got - left, unit)
        const deviation = round(consumption - n, unit)
        rows.push({ mat, before: got, norm: n, actual: left, consumption, deviation, confirmed: !!MAT[mat].key })
        const closeAt = planFinish(o.id, st)
        s.moves.push({ objectId: o.id, mat, qty: -consumption, type: 'consumption', stage: st, cost: MAT[mat].price, at: closeAt })
        if (Math.abs(deviation) > n * SETTINGS.consumptionTolerance) {
          const kind = deviation > 0 ? 'over' : 'saving'
          const reason = kind === 'over' ? s.variances.filter(v => v.objectId === o.id && v.stage === st && v.mat === mat).at(-1)?.reason ?? 'site_damage' : undefined
          s.variances.push({ id: id(), kind, objectId: o.id, stage: st, mat, qty: Math.abs(deviation), rub: Math.abs(deviation) * MAT[mat].price, reason, demo: false, at: closeAt })
        }
      }
      s.closes.push({ objectId: o.id, stage: st, at: planFinish(o.id, st), rows, demo: false })
    }
    if (o.activeReceived?.length) addReq(o.activeStage, o.activeReceived, planStart(o.id, o.activeStage), false)
    s.events.push({ at: planStart(o.id, o.activeStage), objectId: o.id, text: `Начат этап ${o.activeStage} «${stageTpl(o.activeStage).name}»`, who: o.foreman })
  }
  s.events.sort((a, b) => a.at.localeCompare(b.at))
  return s
}
