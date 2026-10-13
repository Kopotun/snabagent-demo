import { FOREMAN_OBJECTS, MAT, OBJ, REASON, REASONS, SETTINGS, SUPPLIERS, TODAY } from './data'
import {
  availableQty, balance, evalDraft, evaluate, fmtDate, forgotten, objNorm, planFinish, requestedBefore, seed,
  stageForMat, stageTpl, surplus, addDays,
  type Btn, type ChatId, type CloseRow, type DraftLine, type Msg, type State,
} from './model'
import { detectObject, findMaterial, fmtQty, nameRoot, normalize, num, parseEdit, parseRequest, round, rub, toBase, type ParsedLine } from './parser'

export type Action =
  | { type: 'say'; chat: ChatId; text: string }
  | { type: 'text'; chat: ChatId; text: string }
  | { type: 'press'; chat: ChatId; msgId?: string; action: string; label: string }
  | { type: 'act'; chat: ChatId; action: string }
  | { type: 'seen'; chat: ChatId }
  | { type: 'order'; lineIds: string[]; supplierId: string }
  | { type: 'ship'; orderNo: number }
  | { type: 'transfer'; from: string; mat: string; lineIds: string[] }
  | { type: 'decide'; lineId: string; decision: 'approve' | 'reject' | 'reduce'; qty?: number }
  | { type: 'reset' }

const FOREMAN = 'Сергей Котов'
const DIRECTOR = 'Андрей Лебедев'

// ---------- Утилиты чата ----------

function hhmm(s: State): string {
  s.clock += 1
  const h = Math.floor(s.clock / 60) % 24
  const m = s.clock % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function nid(s: State) { return `m${s.seq.id++}` }

function bot(s: State, chat: ChatId, text: string | undefined, extra: Partial<Msg> = {}): Msg {
  const msg: Msg = { id: nid(s), from: 'bot', text, time: hhmm(s), ...extra }
  s.chats[chat].push(msg)
  s.unread[chat]++
  return msg
}
function event(s: State, text: string, who: string, objectId?: string) {
  s.events.push({ at: TODAY, objectId, text, who })
}
function useButtons(s: State, chat: ChatId, pred: (m: Msg) => boolean) {
  for (const m of s.chats[chat]) if (m.buttons && pred(m)) m.used = true
}
function stageLabel(st: number) { return `этап ${st} «${stageTpl(st).name}»` }
function q(mat: string, v: number) { return fmtQty(v, MAT[mat].unit) }

const MENU_HINT = 'Напишите заявку своими словами — например: «брус 150 на 150 двадцать штук, гвозди мешок». Или нажмите «Типовая заявка».'

function objectButtons(action: string): Btn[][] {
  return FOREMAN_OBJECTS.map(id => [{ label: `${OBJ[id].name}`, action: `${action}:${id}` }])
}

// ---------- Начальное состояние ----------

export function initState(): State {
  const s = seed()
  bot(s, 'foreman', `Здравствуйте, Сергей! Ваши объекты: Лесная, 12 (${stageLabel(s.activeStage.les12)}) и Лесная, 14 (${stageLabel(s.activeStage.les14)}).\n\n${MENU_HINT}`)
  bot(s, 'director', 'Здравствуйте, Андрей! Сюда приходят согласования перерасхода сверх нормы, итоги закрытия этапов и сводка за день.')
  s.unread = { foreman: 0, director: 0 }
  return s
}

// ---------- Черновик ----------

function makeLine(s: State, objectId: string, pl: ParsedLine, key: string): DraftLine {
  const active = s.activeStage[objectId]
  if (!pl.mat) return { key, raw: pl.raw, options: pl.options, qtyInput: pl.qtyInput, unitInput: pl.unitInput, qty: pl.qty, stage: active }
  const { stage, moved } = stageForMat(s, objectId, pl.mat)
  return {
    key, raw: pl.raw, mat: pl.mat, qtyInput: pl.qtyInput, unitInput: pl.unitInput, qty: pl.qty, stage,
    note: moved ? `отнесено к ${stageLabel(stage)}` : normOfStage(objectId, stage, pl.mat) === 0 ? 'нет в норме дома' : undefined,
  }
}
function normOfStage(objectId: string, stage: number, mat: string) {
  return objNorm(objectId, stage).find(([m]) => m === mat)?.[1] ?? 0
}

function postDraft(s: State) {
  const d = s.draft!
  if (s.draftMsgId) {
    const old = s.chats.foreman.find(m => m.id === s.draftMsgId)
    if (old?.card?.type === 'draft') { old.card.outdated = true; old.used = true }
  }
  useButtons(s, 'foreman', m => m.buttons!.flat().some(b => b.action.startsWith('pick:')))
  const evals = Object.fromEntries(evalDraft(s, d))
  const fg = d.forgottenAdded ? [] : forgotten(s, d)
  const buttons: Btn[][] = [[{ label: 'Отправить', action: 'draft:send', tone: 'primary' }]]
  const row2: Btn[] = []
  if (fg.length) row2.push({ label: 'Добавить забытое', action: 'draft:forgotten' })
  row2.push({ label: d.urgent ? 'Срочно: включено' : 'Срочно, бригада стоит', action: 'draft:urgent' })
  buttons.push(row2)
  buttons.push([{ label: 'Другой объект', action: 'draft:object', tone: 'quiet' }, { label: 'Отмена', action: 'draft:cancel', tone: 'danger' }])
  const msg = bot(s, 'foreman', undefined, { card: { type: 'draft', draft: structuredClone(d), evals, forgotten: fg }, buttons })
  s.draftMsgId = msg.id
  for (const l of d.lines) {
    if (!l.mat && l.options) {
      bot(s, 'foreman', `Уточните «${l.raw}» — что именно?`, {
        buttons: [l.options.map(o => ({ label: MAT[o].name, action: `pick:${l.key}:${o}` })), [{ label: 'Убрать из заявки', action: `pick:${l.key}:none`, tone: 'quiet' }]],
      })
    }
  }
}

function startDraft(s: State, objectId: string, lines: ParsedLine[], source: 'text' | 'template', raw: string) {
  s.draft = { objectId, lines: lines.map((pl, i) => makeLine(s, objectId, pl, `k${s.seq.id}_${i}`)), urgent: false, source, raw, forgottenAdded: false }
  s.seq.id++
  s.lastObject = objectId
  postDraft(s)
}

function templateDraft(s: State, objectId: string) {
  const st = s.activeStage[objectId]
  const lines: ParsedLine[] = []
  for (const [mat, n] of objNorm(objectId, st)) {
    const rest = round(n - requestedBefore(s, objectId, st, mat), MAT[mat].unit)
    if (rest > 0) lines.push({ raw: MAT[mat].name, mat, qtyInput: rest, unitInput: MAT[mat].unit, qty: rest })
  }
  if (!lines.length) {
    bot(s, 'foreman', `По ${stageLabel(st)} на ${OBJ[objectId].name} всё по норме уже заявлено. Если нужно сверх — напишите заявку текстом.`)
    return
  }
  bot(s, 'foreman', `Типовая заявка: всё, что осталось по норме ${stageLabel(st)}. Поправьте текстом — например «брус 10, ветрозащиту убери» — и отправьте.`)
  startDraft(s, objectId, lines, 'template', 'Типовая заявка этапа')
}

function applyEdit(s: State, text: string): boolean {
  const d = s.draft!
  const ops = parseEdit(text)
  const t = normalize(text)
  let changed = false
  const byRoot = (raw: string) => d.lines.find(l => l.mat && normalize(raw).includes(nameRoot(l.mat)))
  for (const op of ops) {
    if (op.op === 'remove') {
      const before = d.lines.length
      d.lines = d.lines.filter(l => !(
        (op.mat && l.mat === op.mat) ||
        (op.options && l.options && l.options.join() === op.options.join()) ||
        (op.options && l.mat && op.options.includes(l.mat)) ||
        (!op.mat && !op.options && l.mat && t.includes(nameRoot(l.mat)))
      ))
      changed ||= d.lines.length !== before
      continue
    }
    const pl = op.line
    const target =
      (pl.mat && d.lines.find(l => l.mat === pl.mat)) ||
      (pl.options && d.lines.find(l => (l.options && l.options.join() === pl.options!.join()) || (l.mat && pl.options!.includes(l.mat)))) ||
      (!pl.mat && byRoot(pl.raw))
    if (target) {
      target.qtyInput = pl.qtyInput
      target.unitInput = pl.unitInput ?? (target.mat ? MAT[target.mat].unit : undefined)
      target.qty = target.mat ? toBase(target.mat, pl.qtyInput, pl.unitInput) : pl.qtyInput
      changed = true
    } else if (pl.mat || pl.options) {
      d.lines.push(makeLine(s, d.objectId, pl, `k${s.seq.id++}`))
      changed = true
    }
  }
  if (changed) postDraft(s)
  return changed
}

// ---------- Отправка и причины ----------

const REASON_BUTTONS = (prefix: string): Btn[][] => [
  REASONS.slice(0, 2).map(r => ({ label: r.name, action: `${prefix}:${r.code}` })),
  REASONS.slice(2, 4).map(r => ({ label: r.name, action: `${prefix}:${r.code}` })),
  REASONS.slice(4, 6).map(r => ({ label: r.name, action: `${prefix}:${r.code}` })),
]

function guessReason(text: string): string {
  const t = normalize(text)
  if (/брак|крив|гнил|трещ|пересорт|не та/.test(t)) return 'supplier_defect'
  if (/намок|дожд|сломал|порч|бой|разбил|повел|украл|снег/.test(t)) return 'site_damage'
  if (/норм[аеуы]|мало заложено|не хватает по норме/.test(t)) return 'norm_error'
  if (/заказчик|покупател|проект|террас|переделк/.test(t)) return 'design_change'
  if (/запас|следующ|впрок|наперед/.test(t)) return 'stock_ahead'
  return 'other'
}

function askReason(s: State) {
  const f = s.flow
  if (f.kind !== 'reasons') return
  const d = s.draft!
  const line = d.lines.find(l => l.key === f.queue[f.idx])!
  const ev = evalDraft(s, d).get(line.key)!
  const tail = ev.zone === 'red'
    ? 'Перебор большой — эта часть уйдёт на согласование руководителю, остальное сразу снабженцу.'
    : 'Перебор небольшой, согласование не нужно.'
  bot(s, 'foreman', `${MAT[line.mat!].name}: сверх нормы ${q(line.mat!, ev.over)} (≈ ${rub(ev.overRub)}). ${tail}\n\nПочему больше нормы? Можно нажать кнопку или написать своими словами.`, {
    buttons: REASON_BUTTONS('reason'),
  })
}

function nextReason(s: State) {
  const f = s.flow
  if (f.kind !== 'reasons') return
  f.idx++
  f.awaitingComment = false
  if (f.idx < f.queue.length) askReason(s)
  else finalizeDraft(s)
}

function sendDraft(s: State) {
  const d = s.draft
  if (!d) return
  const unclear = d.lines.filter(l => !l.mat && l.options)
  if (unclear.length) {
    bot(s, 'foreman', `Сначала уточните: ${unclear.map(l => `«${l.raw}»`).join(', ')} — кнопки выше.`)
    return
  }
  const unknown = d.lines.filter(l => !l.mat && !l.options)
  if (unknown.length) {
    d.lines = d.lines.filter(l => l.mat)
    bot(s, 'foreman', `Не узнал: ${unknown.map(l => `«${l.raw}»`).join(', ')}. Передал снабженцу на разбор — он уточнит.`)
    event(s, `Нераспознанные строки переданы снабженцу: ${unknown.map(l => l.raw).join(', ')}`, 'Бот', d.objectId)
  }
  if (!d.lines.length) { bot(s, 'foreman', 'В заявке не осталось позиций.'); s.draft = null; return }
  const evals = evalDraft(s, d)
  const queue = d.lines.filter(l => evals.get(l.key)!.zone !== 'green').map(l => l.key)
  useButtons(s, 'foreman', m => m.id === s.draftMsgId)
  if (queue.length) {
    s.flow = { kind: 'reasons', queue, idx: 0, awaitingComment: false, reasons: {} }
    askReason(s)
  } else finalizeDraft(s)
}

function finalizeDraft(s: State) {
  const d = s.draft!
  const reasons = s.flow.kind === 'reasons' ? s.flow.reasons : {}
  const evals = evalDraft(s, d)
  const no = s.seq.req++
  s.reqs.push({ no, objectId: d.objectId, author: FOREMAN, source: d.source, raw: d.raw, at: TODAY, urgent: d.urgent, demo: true })
  const red: string[] = []
  let greenCount = 0
  for (const l of d.lines) {
    const ev = evals.get(l.key)!
    const r = reasons[l.key]
    const id = `l${s.seq.id++}`
    s.lines.push({
      id, reqNo: no, objectId: d.objectId, stage: l.stage, mat: l.mat!, qty: l.qty, qtyInput: l.qtyInput, unitInput: l.unitInput, raw: l.raw,
      zone: ev.zone, normAt: ev.norm, remainingAt: ev.remaining, over: ev.over, overRub: ev.overRub,
      approval: ev.zone === 'red' ? (d.urgent ? 'retro' : 'pending') : 'none',
      reason: r?.code, comment: r?.comment, ordered: 0, received: 0, urgent: d.urgent, demo: true, at: TODAY,
    })
    if (ev.zone !== 'green') {
      s.variances.push({ id: `v${s.seq.id++}`, kind: 'order', objectId: d.objectId, stage: l.stage, mat: l.mat!, qty: ev.over, rub: ev.overRub, reason: r?.code, comment: r?.comment, demo: true, at: TODAY })
    }
    if (ev.zone === 'red') {
      red.push(`${MAT[l.mat!].name} +${q(l.mat!, ev.over)}`)
      const head = d.urgent ? 'Срочная заявка — уже в закупке, согласуйте задним числом.' : 'Нужно ваше решение по перерасходу.'
      bot(s, 'director', head, {
        card: { type: 'approval', lineId: id },
        buttons: [[{ label: 'Согласовать', action: `dir:approve:${id}`, tone: 'primary' }, { label: 'Уменьшить', action: `dir:reduce:${id}` }, { label: 'Отклонить', action: `dir:reject:${id}`, tone: 'danger' }]],
      })
    } else greenCount++
  }
  const rows = [`Заявка №${no} на ${OBJ[d.objectId].name} отправлена.`]
  if (greenCount) rows.push(`${greenCount} ${plural(greenCount, 'позиция', 'позиции', 'позиций')} — сразу снабженцу.`)
  if (red.length && !d.urgent) rows.push(`На согласовании у руководителя: ${red.join('; ')}. Остальное по этим позициям уже у снабженца. Сообщу о решении.`)
  if (red.length && d.urgent) rows.push(`Срочная: всё сразу в закупке, руководитель согласует перерасход задним числом (${red.join('; ')}).`)
  bot(s, 'foreman', rows.join('\n'))
  event(s, `Заявка №${no}: ${d.lines.length} ${plural(d.lines.length, 'позиция', 'позиции', 'позиций')}${red.length ? `, на согласовании ${red.length}` : ''}${d.urgent ? ', срочная' : ''}`, FOREMAN, d.objectId)
  s.draft = null
  s.draftMsgId = undefined
  s.flow = { kind: 'idle' }
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

// ---------- Согласование ----------

function decide(s: State, lineId: string, decision: 'approve' | 'reject' | 'reduce', qty?: number) {
  const l = s.lines.find(x => x.id === lineId)
  if (!l || (l.approval !== 'pending' && l.approval !== 'retro')) return
  const wasRetro = l.approval === 'retro'
  const v = s.variances.find(x => x.kind === 'order' && x.objectId === l.objectId && x.mat === l.mat && x.demo && x.qty === l.over && x.stage === l.stage)
  const name = MAT[l.mat].name
  if (decision === 'approve') {
    l.approval = 'approved'
    bot(s, 'foreman', `Руководитель согласовал перерасход: ${name} +${q(l.mat, l.over)} (заявка №${l.reqNo}).`)
    event(s, `Согласован перерасход: ${name} +${q(l.mat, l.over)}`, DIRECTOR, l.objectId)
  } else if (decision === 'reject') {
    l.approval = 'rejected'
    if (v) { v.qty = 0; v.rub = 0 }
    const rest = q(l.mat, l.qty - l.over)
    bot(s, 'foreman', wasRetro
      ? `Руководитель не согласовал срочный перерасход: ${name} +${q(l.mat, l.over)}. Материал уже в закупке — случай отмечен в аналитике.`
      : `Руководитель отклонил перерасход: ${name} +${q(l.mat, l.over)}. В закупку уйдёт ${rest} по норме.`)
    event(s, `Отклонён перерасход: ${name} +${q(l.mat, l.over)}`, DIRECTOR, l.objectId)
  } else {
    const ok = Math.max(0, Math.min(l.over, qty ?? 0))
    l.approval = 'reduced'
    l.approvedOver = ok
    if (v) { v.qty = ok; v.rub = ok * MAT[l.mat].price }
    bot(s, 'foreman', `Руководитель согласовал перерасход частично: ${name} +${q(l.mat, ok)} вместо +${q(l.mat, l.over)}.`)
    event(s, `Перерасход урезан: ${name} +${q(l.mat, ok)} из +${q(l.mat, l.over)}`, DIRECTOR, l.objectId)
  }
  useButtons(s, 'director', m => m.card?.type === 'approval' && m.card.lineId === lineId)
  s.dirFlow = { kind: 'idle' }
}

// ---------- Закупка, отгрузка, перемещение ----------

function createOrder(s: State, lineIds: string[], supplierId: string) {
  const lines = s.lines.filter(l => lineIds.includes(l.id) && availableQty(l) > 0)
  if (!lines.length) return
  const no = s.seq.order++
  const byMat = new Map<string, { qty: number; allocs: { lineId: string; objectId: string; qty: number }[] }>()
  const added = new Map<string, number>()
  for (const l of lines) {
    const a = availableQty(l)
    added.set(l.id, a)
    const e = byMat.get(l.mat) ?? { qty: 0, allocs: [] }
    e.qty = round(e.qty + a, MAT[l.mat].unit)
    e.allocs.push({ lineId: l.id, objectId: l.objectId, qty: a })
    byMat.set(l.mat, e)
    l.ordered = round(l.ordered + a, MAT[l.mat].unit)
  }
  s.orders.push({ no, supplierId, status: 'sent', at: TODAY, demo: true, lines: [...byMat].map(([mat, e]) => ({ mat, qty: e.qty, price: MAT[mat].price, allocs: e.allocs })) })
  const sup = SUPPLIERS.find(x => x.id === supplierId)!.name
  const eta = fmtDate(addDays(TODAY, 2))
  const forForeman = new Map<string, string[]>()
  for (const l of lines) if (FOREMAN_OBJECTS.includes(l.objectId)) {
    const arr = forForeman.get(l.objectId) ?? []
    arr.push(`${MAT[l.mat].name} — ${q(l.mat, added.get(l.id) ?? 0)}`)
    forForeman.set(l.objectId, arr)
  }
  for (const [obj, rows] of forForeman) bot(s, 'foreman', `Заказано для ${OBJ[obj].name} у поставщика «${sup.replace(/[«»]/g, '')}», поставка ориентировочно ${eta}:\n${rows.map(r => `• ${r}`).join('\n')}`)
  event(s, `Заказ №${no} поставщику ${sup}: ${byMat.size} ${plural(byMat.size, 'позиция', 'позиции', 'позиций')}`, 'Снабженец')
}

function shipOrder(s: State, orderNo: number) {
  const o = s.orders.find(x => x.no === orderNo)
  if (!o || o.status !== 'sent') return
  o.status = 'shipped'
  const byObj = new Map<string, { mat: string; qty: number; accepted: number; allocs: { lineId: string; qty: number }[] }[]>()
  for (const ol of o.lines) for (const a of ol.allocs) {
    const arr = byObj.get(a.objectId) ?? []
    let sl = arr.find(x => x.mat === ol.mat)
    if (!sl) { sl = { mat: ol.mat, qty: 0, accepted: 0, allocs: [] }; arr.push(sl) }
    sl.qty = round(sl.qty + a.qty, MAT[ol.mat].unit)
    sl.allocs.push({ lineId: a.lineId, qty: a.qty })
    byObj.set(a.objectId, arr)
  }
  for (const [objectId, lines] of byObj) {
    const id = `sh${s.seq.id++}`
    s.shipments.push({ id, orderNo, objectId, status: 'expected', lines, photo: false, at: TODAY })
    announceShipment(s, id)
  }
  event(s, `Заказ №${orderNo} отгружен поставщиком`, 'Снабженец')
}

function announceShipment(s: State, id: string) {
  const sh = s.shipments.find(x => x.id === id)!
  if (!FOREMAN_OBJECTS.includes(sh.objectId)) return
  bot(s, 'foreman', undefined, {
    card: { type: 'shipment', shipmentId: id },
    buttons: [[{ label: 'Принято всё', action: `ship:ok:${id}`, tone: 'primary' }, { label: 'Есть расхождение', action: `ship:diff:${id}` }]],
  })
}

function transfer(s: State, from: string, mat: string, lineIds: string[]) {
  const lines = s.lines.filter(l => lineIds.includes(l.id) && availableQty(l) > 0)
  let left = surplus(s, from, mat)
  if (!lines.length || left <= 0) return
  const target = lines[0].objectId
  const allocs: { lineId: string; qty: number }[] = []
  for (const l of lines) {
    if (left <= 0 || l.objectId !== target) continue
    const part = round(Math.min(left, availableQty(l)), MAT[mat].unit)
    l.ordered = round(l.ordered + part, MAT[mat].unit)
    left = round(left - part, MAT[mat].unit)
    allocs.push({ lineId: l.id, qty: part })
  }
  const qty = round(allocs.reduce((a, x) => a + x.qty, 0), MAT[mat].unit)
  s.moves.push({ objectId: from, mat, qty: -qty, type: 'transfer_out', cost: MAT[mat].price, at: TODAY })
  const id = `sh${s.seq.id++}`
  s.shipments.push({ id, transferFrom: from, objectId: target, status: 'expected', lines: [{ mat, qty, accepted: 0, allocs }], photo: false, at: TODAY })
  event(s, `Перемещение: ${MAT[mat].name} ${q(mat, qty)} с ${OBJ[from].name} на ${OBJ[target].name} вместо покупки`, 'Снабженец', target)
  announceShipment(s, id)
}

function finishAcceptance(s: State, shipmentId: string) {
  const sh = s.shipments.find(x => x.id === shipmentId)!
  const diffs: string[] = []
  for (const sl of sh.lines) {
    let left = sl.accepted
    for (const a of sl.allocs) {
      const l = s.lines.find(x => x.id === a.lineId)!
      const part = round(Math.min(left, a.qty), MAT[sl.mat].unit)
      left = round(left - part, MAT[sl.mat].unit)
      l.received = round(l.received + part, MAT[sl.mat].unit)
      if (part > 0) s.moves.push({ objectId: sh.objectId, mat: sl.mat, qty: part, type: sh.transferFrom ? 'transfer_in' : 'receipt', stage: l.stage, cost: MAT[sl.mat].price, at: TODAY })
    }
    if (sl.accepted < sl.qty) diffs.push(`${MAT[sl.mat].name}: недовоз ${q(sl.mat, round(sl.qty - sl.accepted, MAT[sl.mat].unit))}`)
  }
  sh.photo = true
  sh.status = diffs.length ? 'discrepancy' : 'accepted'
  const got = sh.lines.map(sl => `• ${MAT[sl.mat].name} — ${q(sl.mat, sl.accepted)}`).join('\n')
  bot(s, 'foreman', `Приёмка проведена, фото сохранено. На ${OBJ[sh.objectId].name} принято:\n${got}${diffs.length ? `\n\nРасхождение передал снабженцу для претензии поставщику:\n${diffs.map(d => `• ${d}`).join('\n')}` : ''}`)
  event(s, `Приёмка${sh.orderNo ? ` по заказу №${sh.orderNo}` : ' перемещения'} с фото${diffs.length ? `, расхождение: ${diffs.join('; ')}` : ''}`, FOREMAN, sh.objectId)
  s.flow = { kind: 'idle' }
}

// ---------- Закрытие этапа ----------

function closingRows(s: State, objectId: string, stage: number) {
  return objNorm(objectId, stage)
    .map(([mat, norm]) => {
      const before = balance(s, objectId, mat)
      return { mat, before, norm, expected: Math.max(0, round(before - norm, MAT[mat].unit)) }
    })
    .sort((a, b) => Number(!!MAT[b.mat].key) - Number(!!MAT[a.mat].key))
}

// Отклонение считаем по ключевым материалам и по тем, что бригадир пересчитал
function counted(r: CloseRow) { return r.confirmed || !!MAT[r.mat].key }

function startClose(s: State, objectId: string) {
  const stage = s.activeStage[objectId]
  s.lastObject = objectId
  const short = closingRows(s, objectId, stage).filter(r => MAT[r.mat].key && r.before < r.norm * 0.8)
  if (short.length) {
    s.flow = { kind: 'closing', objectId, stage, confirmShort: true }
    bot(s, 'foreman', `На ${OBJ[objectId].name} по ${stageLabel(stage)} ещё не получено по норме:\n${short.map(r => `• ${MAT[r.mat].name} — на объекте ${q(r.mat, r.before)} из ${q(r.mat, r.norm)}`).join('\n')}\n\nЕсли работы закончены и материала хватило — закрываем, разница покажется экономией.`, {
      buttons: [[{ label: 'Закрыть этап', action: 'close:force', tone: 'primary' }, { label: 'Отмена', action: 'close:cancel', tone: 'quiet' }]],
    })
    return
  }
  showClosing(s, objectId, stage)
}

function showClosing(s: State, objectId: string, stage: number) {
  s.flow = { kind: 'closing', objectId, stage }
  bot(s, 'foreman', `Закрываем ${stageLabel(stage)} на ${OBJ[objectId].name}. Я посчитал, сколько должно остаться по норме. Пересчитайте ключевые материалы и напишите фактический остаток — например «брус 2, доска 0,3». Что не напишете, посчитаю как рассчитано.`, {
    card: { type: 'closing', objectId, stage, rows: closingRows(s, objectId, stage) },
    buttons: [[{ label: 'Всё как рассчитано', action: 'close:asis', tone: 'primary' }, { label: 'Отмена', action: 'close:cancel', tone: 'quiet' }]],
  })
}

function submitClose(s: State, actual: Map<string, number>, asIs = false) {
  const f = s.flow
  if (f.kind !== 'closing') return
  const rows: CloseRow[] = closingRows(s, f.objectId, f.stage).map(r => {
    const u = MAT[r.mat].unit
    const a = actual.has(r.mat) ? actual.get(r.mat)! : r.expected
    const consumption = round(Math.max(0, r.before - a), u)
    return { mat: r.mat, before: r.before, norm: r.norm, actual: a, consumption, deviation: round(consumption - r.norm, u), confirmed: actual.has(r.mat) || asIs }
  })
  useButtons(s, 'foreman', m => m.card?.type === 'closing')
  const queue = rows.filter(r => counted(r) && r.before > 0 && r.deviation > r.norm * SETTINGS.consumptionTolerance).map(r => r.mat)
  if (queue.length) {
    s.flow = { kind: 'closingReasons', objectId: f.objectId, stage: f.stage, rows, queue, idx: 0, reasons: {} }
    askCloseReason(s)
  } else finalizeClose(s, f.objectId, f.stage, rows, {})
}

function askCloseReason(s: State) {
  const f = s.flow
  if (f.kind !== 'closingReasons') return
  const r = f.rows.find(x => x.mat === f.queue[f.idx])!
  bot(s, 'foreman', `${MAT[r.mat].name}: израсходовано ${q(r.mat, r.consumption)} при норме ${q(r.mat, r.norm)} — перерасход ${q(r.mat, r.deviation)} (≈ ${rub(r.deviation * MAT[r.mat].price)}). Почему?`, {
    buttons: REASON_BUTTONS('creason'),
  })
}

function finalizeClose(s: State, objectId: string, stage: number, rows: CloseRow[], reasons: Record<string, string>) {
  const tol = SETTINGS.consumptionTolerance
  const out: { text: string; tone?: 'green' | 'yellow' | 'red' | 'muted' }[] = []
  let overRub = 0, savingRub = 0
  for (const r of rows) {
    const price = MAT[r.mat].price
    s.moves.push({ objectId, mat: r.mat, qty: -r.consumption, type: 'consumption', stage, cost: price, at: TODAY })
    if (r.before === 0) { out.push({ text: `${MAT[r.mat].name}: не поставлялось`, tone: 'muted' }); continue }
    if (!counted(r)) { out.push({ text: `${MAT[r.mat].name}: списано ${q(r.mat, r.consumption)}, не пересчитывали`, tone: 'muted' }); continue }
    if (r.deviation > r.norm * tol) {
      overRub += r.deviation * price
      s.variances.push({ id: `v${s.seq.id++}`, kind: 'over', objectId, stage, mat: r.mat, qty: r.deviation, rub: r.deviation * price, reason: reasons[r.mat], demo: true, at: TODAY })
      out.push({ text: `${MAT[r.mat].name}: перерасход ${q(r.mat, r.deviation)} ≈ ${rub(r.deviation * price)} (${REASON[reasons[r.mat]] ?? 'без причины'})`, tone: 'red' })
    } else if (r.deviation < -r.norm * tol) {
      savingRub += -r.deviation * price
      s.variances.push({ id: `v${s.seq.id++}`, kind: 'saving', objectId, stage, mat: r.mat, qty: -r.deviation, rub: -r.deviation * price, demo: true, at: TODAY })
      out.push({ text: `${MAT[r.mat].name}: экономия ${q(r.mat, -r.deviation)} ≈ ${rub(-r.deviation * price)}`, tone: 'green' })
    } else out.push({ text: `${MAT[r.mat].name}: по норме, израсходовано ${q(r.mat, r.consumption)}${r.confirmed ? '' : ' (не пересчитано)'}`, tone: 'muted' })
  }
  s.closes.push({ objectId, stage, at: TODAY, rows, demo: true })
  s.activeStage[objectId] = stage + 1
  const title = `${OBJ[objectId].name}: закрыт ${stageLabel(stage)}`
  bot(s, 'foreman', `Этап закрыт. Следующий — ${stageLabel(stage + 1)}, по плану до ${fmtDate(planFinish(objectId, stage + 1))}.`, { card: { type: 'list', title, rows: out } })
  bot(s, 'director', `Итог этапа. Перерасход ≈ ${rub(overRub)}, экономия ≈ ${rub(savingRub)}.`, { card: { type: 'list', title, rows: out } })
  event(s, `Закрыт ${stageLabel(stage)}: перерасход ${rub(overRub)}, экономия ${rub(savingRub)}`, FOREMAN, objectId)
  s.flow = { kind: 'idle' }
}

// ---------- Справка и списки ----------

function myRequests(s: State) {
  const reqs = s.reqs.filter(r => FOREMAN_OBJECTS.includes(r.objectId)).slice(-5).reverse()
  const rows = reqs.map(r => {
    const ls = s.lines.filter(l => l.reqNo === r.no)
    let status = 'у снабженца'
    let tone: 'green' | 'yellow' | 'red' | 'muted' = 'muted'
    if (ls.some(l => l.approval === 'pending')) { status = 'ждёт согласования'; tone = 'yellow' }
    else if (ls.every(l => l.received >= l.ordered && l.ordered > 0 && availableQty(l) === 0)) { status = 'принята на объекте'; tone = 'green' }
    else if (ls.some(l => l.ordered > 0)) status = 'заказана'
    return { text: `№${r.no}, ${OBJ[r.objectId].name}, ${ls.length} поз. — ${status}`, tone }
  })
  bot(s, 'foreman', undefined, { card: { type: 'list', title: 'Мои последние заявки', rows } })
}

function answerQuestion(s: State, text: string): boolean {
  const { mat } = findMaterial(text)
  if (!mat) return false
  const objectId = detectObject(text) ?? s.lastObject ?? 'les12'
  const st = s.activeStage[objectId]
  const ev = evaluate(s, objectId, st, mat, 0)
  bot(s, 'foreman', `${OBJ[objectId].name}, ${stageLabel(st)}. ${MAT[mat].name}: по норме ${q(mat, ev.norm)}, уже заявлено ${q(mat, ev.before)}, осталось ${q(mat, Math.max(0, ev.remaining))}. На объекте сейчас ${q(mat, balance(s, objectId, mat))}.\nИсточник: норма проекта Д-120, версия 3.`)
  return true
}

function daySummary(s: State) {
  const today = s.lines.filter(l => l.demo)
  const pending = s.lines.filter(l => l.approval === 'pending').length
  const yellow = today.filter(l => l.zone === 'yellow')
  const urgent = today.filter(l => l.urgent)
  const top = [...s.variances].filter(v => (v.kind === 'over' || (v.kind === 'order' && v.demo)) && v.qty > 0).sort((a, b) => b.rub - a.rub).slice(0, 3)
  const rows = [
    { text: `Ждут вашего решения: ${pending}`, tone: pending ? 'yellow' as const : 'muted' as const },
    { text: `Небольшой перебор без согласования сегодня: ${yellow.length}${yellow.length ? ` (${yellow.map(l => MAT[l.mat].name).join(', ')})` : ''}`, tone: 'muted' as const },
    { text: `Срочные заявки сегодня: ${urgent.length}`, tone: 'muted' as const },
    ...top.map(v => ({ text: `${OBJ[v.objectId].name}: ${MAT[v.mat].name} +${q(v.mat, v.qty)} ≈ ${rub(v.rub)} — ${REASON[v.reason ?? ''] ?? 'причина не указана'}`, tone: 'red' as const })),
  ]
  bot(s, 'director', undefined, { card: { type: 'list', title: 'Сводка за день', rows } })
}

// ---------- Обработчики ----------

function onForemanText(s: State, text: string) {
  const f = s.flow
  if (f.kind === 'reasons') {
    const key = f.queue[f.idx]
    const code = f.awaitingComment ? 'other' : guessReason(text)
    f.reasons[key] = { code, comment: text }
    if (!f.awaitingComment) bot(s, 'foreman', `Записал причину: «${REASON[code]}» — с ваших слов.`)
    nextReason(s)
    return
  }
  if (f.kind === 'closingReasons') {
    const code = guessReason(text)
    f.reasons[f.queue[f.idx]] = code
    bot(s, 'foreman', `Записал причину: «${REASON[code]}».`)
    f.idx++
    if (f.idx < f.queue.length) askCloseReason(s)
    else finalizeClose(s, f.objectId, f.stage, f.rows, f.reasons)
    return
  }
  if (f.kind === 'acceptPhoto') { bot(s, 'foreman', 'Для приёмки нужна фотография накладной или выгрузки — нажмите скрепку слева от поля ввода.'); return }
  if (f.kind === 'acceptDiscrepancy') {
    const sh = s.shipments.find(x => x.id === f.shipmentId)!
    let hit = 0
    for (const op of parseEdit(text)) {
      if (op.op !== 'upsert') continue
      const sl = sh.lines.find(x => x.mat === op.line.mat) ?? sh.lines.find(x => normalize(op.line.raw).includes(nameRoot(x.mat)))
      if (sl) { sl.accepted = Math.min(sl.qty, toBase(sl.mat, op.line.qtyInput, op.line.unitInput)); hit++ }
    }
    if (!hit) { bot(s, 'foreman', `Не понял. Напишите, сколько пришло, например: «${MAT[sh.lines[0].mat].name.split(' ')[0].toLowerCase()} ${num(Math.max(0, sh.lines[0].qty - 2))}».`); return }
    s.flow = { kind: 'acceptPhoto', shipmentId: sh.id }
    bot(s, 'foreman', `Принято с расхождением:\n${sh.lines.map(sl => `• ${MAT[sl.mat].name} — ${q(sl.mat, sl.accepted)} из ${q(sl.mat, sl.qty)}`).join('\n')}\n\nТеперь сфотографируйте накладную или выгрузку — без фото приёмку не закрыть.`)
    return
  }
  if (f.kind === 'closing') {
    if (f.confirmShort) { bot(s, 'foreman', 'Нажмите «Закрыть этап» или «Отмена».'); return }
    const actual = new Map<string, number>()
    const rows = closingRows(s, f.objectId, f.stage)
    for (const op of parseEdit(text)) {
      if (op.op !== 'upsert') continue
      const r = rows.find(x => x.mat === op.line.mat) ?? rows.find(x => normalize(op.line.raw).includes(nameRoot(x.mat)))
      if (r) actual.set(r.mat, toBase(r.mat, op.line.qtyInput, op.line.unitInput))
    }
    if (!actual.size) { bot(s, 'foreman', 'Не понял остатки. Напишите, например: «брус 2, доска 0,3» — или нажмите «Всё как рассчитано».'); return }
    submitClose(s, actual)
    return
  }
  if (f.kind === 'pickObject') {
    const obj = detectObject(text)
    if (obj && FOREMAN_OBJECTS.includes(obj)) { onForemanAct(s, `obj:${f.then}:${obj}`); return }
    bot(s, 'foreman', 'Выберите объект кнопкой выше.')
    return
  }
  if (s.draft) {
    if (!applyEdit(s, text)) bot(s, 'foreman', 'Не понял правку. Напишите, например: «брус 18», «убери пену» или «добавь уголки 120».')
    return
  }
  if (/\?\s*$|^(сколько|что по|какая норма|осталось)/i.test(text.trim()) && answerQuestion(s, text)) return
  const parsed = parseRequest(text)
  if (!parsed.lines.length) {
    bot(s, 'foreman', `Не понял заявку. ${MENU_HINT}`)
    return
  }
  if (parsed.objectId && !FOREMAN_OBJECTS.includes(parsed.objectId)) {
    bot(s, 'foreman', `${OBJ[parsed.objectId].name} закреплена за другой бригадой. Для какого из ваших объектов заявка?`, { buttons: objectButtons('obj:draft') })
    s.flow = { kind: 'pickObject', then: 'draft', pendingText: text }
    return
  }
  const objectId = parsed.objectId ?? s.lastObject
  if (!objectId) {
    s.flow = { kind: 'pickObject', then: 'draft', pendingText: text }
    bot(s, 'foreman', 'Для какого объекта заявка?', { buttons: objectButtons('obj:draft') })
    return
  }
  startDraft(s, objectId, parsed.lines, 'text', text)
}

function onForemanAct(s: State, action: string) {
  const [kind, a, b] = action.split(':')
  if (kind === 'menu') {
    if (s.draft && a !== 'help') { bot(s, 'foreman', 'Сначала отправьте или отмените текущий черновик.'); return }
    if (s.flow.kind !== 'idle' && s.flow.kind !== 'pickObject') { bot(s, 'foreman', 'Сначала закончите текущее действие.'); return }
    if (a === 'new') { bot(s, 'foreman', MENU_HINT); return }
    if (a === 'template' || a === 'close') {
      s.flow = { kind: 'pickObject', then: a }
      bot(s, 'foreman', a === 'template' ? 'Для какого объекта типовая заявка?' : 'На каком объекте закрываем этап?', { buttons: objectButtons(`obj:${a}`) })
      return
    }
    if (a === 'mine') { myRequests(s); return }
    if (a === 'accept') {
      const pending = s.shipments.filter(x => x.status === 'expected' && FOREMAN_OBJECTS.includes(x.objectId))
      if (!pending.length) bot(s, 'foreman', 'Сейчас нет поставок, ожидающих приёмки.')
      else for (const sh of pending) announceShipment(s, sh.id)
      return
    }
    return
  }
  if (kind === 'obj') {
    const pending = s.flow.kind === 'pickObject' ? s.flow.pendingText : undefined
    useButtons(s, 'foreman', m => m.buttons!.flat().some(x => x.action.startsWith('obj:')))
    s.flow = { kind: 'idle' }
    if (a === 'template') templateDraft(s, b)
    else if (a === 'close') startClose(s, b)
    else if (a === 'draft' && pending) startDraft(s, b, parseRequest(pending).lines, 'text', pending)
    else if (a === 'switch' && s.draft) {
      s.draft.objectId = b
      s.draft.lines = s.draft.lines.map(l => (l.mat ? makeLine(s, b, { raw: l.raw, mat: l.mat, qtyInput: l.qtyInput, unitInput: l.unitInput, qty: l.qty }, l.key) : l))
      s.lastObject = b
      postDraft(s)
    }
    return
  }
  if (kind === 'draft' && s.draft) {
    if (a === 'send') sendDraft(s)
    else if (a === 'cancel') {
      useButtons(s, 'foreman', m => m.id === s.draftMsgId)
      s.draft = null; s.draftMsgId = undefined
      bot(s, 'foreman', 'Черновик удалён.')
    } else if (a === 'urgent') { s.draft.urgent = !s.draft.urgent; postDraft(s) }
    else if (a === 'forgotten') {
      for (const [mat] of forgotten(s, s.draft)) {
        const st = s.activeStage[s.draft.objectId]
        const rest = round(normOfStage(s.draft.objectId, st, mat) - requestedBefore(s, s.draft.objectId, st, mat), MAT[mat].unit)
        s.draft.lines.push(makeLine(s, s.draft.objectId, { raw: MAT[mat].name, mat, qtyInput: rest, unitInput: MAT[mat].unit, qty: rest }, `k${s.seq.id++}`))
      }
      s.draft.forgottenAdded = true
      postDraft(s)
    } else if (a === 'object') {
      bot(s, 'foreman', 'Для какого объекта эта заявка?', { buttons: objectButtons('obj:switch') })
    }
    return
  }
  if (kind === 'pick' && s.draft) {
    const line = s.draft.lines.find(l => l.key === a)
    if (!line) return
    if (b === 'none') s.draft.lines = s.draft.lines.filter(l => l.key !== a)
    else Object.assign(line, makeLine(s, s.draft.objectId, { raw: line.raw, mat: b, qtyInput: line.qtyInput, unitInput: line.unitInput, qty: toBase(b, line.qtyInput, line.unitInput) }, line.key))
    if (b !== 'none') bot(s, 'foreman', `Запомнил: «${line.raw.replace(/\s*\d.*$/, '')}» — это ${MAT[b].name}. В следующий раз не буду переспрашивать.`)
    postDraft(s)
    return
  }
  if (kind === 'reason' && s.flow.kind === 'reasons') {
    if (a === 'other') { s.flow.awaitingComment = true; bot(s, 'foreman', 'Напишите причину одной фразой.'); return }
    s.flow.reasons[s.flow.queue[s.flow.idx]] = { code: a }
    nextReason(s)
    return
  }
  if (kind === 'creason' && s.flow.kind === 'closingReasons') {
    const f = s.flow
    f.reasons[f.queue[f.idx]] = a
    f.idx++
    if (f.idx < f.queue.length) askCloseReason(s)
    else finalizeClose(s, f.objectId, f.stage, f.rows, f.reasons)
    return
  }
  if (kind === 'ship') {
    const sh = s.shipments.find(x => x.id === b)
    if (!sh || sh.status !== 'expected') return
    useButtons(s, 'foreman', m => m.card?.type === 'shipment' && m.card.shipmentId === b)
    if (a === 'ok') {
      for (const sl of sh.lines) sl.accepted = sl.qty
      s.flow = { kind: 'acceptPhoto', shipmentId: b }
      bot(s, 'foreman', 'Сфотографируйте накладную или выгрузку и отправьте фото — скрепка слева от поля ввода. Без фото приёмку не закрыть.')
    } else {
      for (const sl of sh.lines) sl.accepted = sl.qty
      s.flow = { kind: 'acceptDiscrepancy', shipmentId: b }
      bot(s, 'foreman', `Напишите, сколько пришло на самом деле. Например: «${MAT[sh.lines[0].mat].name.split(' ')[0].toLowerCase()} ${num(Math.max(0, sh.lines[0].qty - 2))}».`)
    }
    return
  }
  if (kind === 'photo') {
    if (s.flow.kind === 'acceptPhoto') finishAcceptance(s, s.flow.shipmentId)
    else bot(s, 'foreman', 'Фото сохранено. Чтобы оформить приёмку, нажмите «Приёмка».')
    return
  }
  if (kind === 'close') {
    const f = s.flow
    if (f.kind !== 'closing') return
    useButtons(s, 'foreman', m => m.buttons!.flat().some(x => x.action.startsWith('close:')))
    if (a === 'cancel') { s.flow = { kind: 'idle' }; bot(s, 'foreman', 'Закрытие этапа отменено.'); return }
    if (a === 'force') { showClosing(s, f.objectId, f.stage); return }
    if (a === 'asis') submitClose(s, new Map(), true)
  }
}

function onDirectorText(s: State, text: string) {
  if (s.dirFlow.kind === 'reduce') {
    const m = text.match(/\d+(?:[.,]\d+)?/)
    if (!m) { bot(s, 'director', 'Напишите число — сколько согласовать сверх нормы.'); return }
    decide(s, s.dirFlow.lineId, 'reduce', parseFloat(m[0].replace(',', '.')))
    bot(s, 'director', 'Готово, бригадир и снабженец уведомлены.')
    return
  }
  if (/сводк/i.test(text)) { daySummary(s); return }
  bot(s, 'director', 'Здесь можно согласовывать перерасход кнопками в карточках и запросить «Сводку за день».')
}

function onDirectorAct(s: State, action: string) {
  const [kind, a, b] = action.split(':')
  if (kind === 'menu' && a === 'summary') { daySummary(s); return }
  if (kind === 'dir') {
    const l = s.lines.find(x => x.id === b)
    if (!l) return
    if (a === 'reduce') {
      s.dirFlow = { kind: 'reduce', lineId: b }
      bot(s, 'director', `Сколько согласовать сверх нормы? Запрошено +${q(l.mat, l.over)}.`)
      return
    }
    decide(s, b, a === 'approve' ? 'approve' : 'reject')
    bot(s, 'director', a === 'approve' ? 'Согласовано. Бригадир и снабженец уведомлены.' : 'Отклонено. В закупку уйдёт только количество по норме.')
  }
}

// ---------- Редьюсер ----------

export function reducer(prev: State, action: Action): State {
  if (action.type === 'reset') return initState()
  const s = structuredClone(prev)
  switch (action.type) {
    case 'say':
      s.chats[action.chat].push({ id: nid(s), from: 'user', text: action.text, time: hhmm(s) })
      s.typing[action.chat] = true
      return s
    case 'text':
      s.typing[action.chat] = false
      if (action.chat === 'foreman') onForemanText(s, action.text)
      else onDirectorText(s, action.text)
      return s
    case 'press': {
      const m = s.chats[action.chat].find(x => x.id === action.msgId)
      if (m) { m.used = true; m.chosen = action.action }
      if (action.action === 'photo') s.chats[action.chat].push({ id: nid(s), from: 'user', photo: true, time: hhmm(s) })
      else if (!m) s.chats[action.chat].push({ id: nid(s), from: 'user', text: action.label, time: hhmm(s) })
      s.typing[action.chat] = true
      return s
    }
    case 'act':
      s.typing[action.chat] = false
      if (action.chat === 'foreman') onForemanAct(s, action.action)
      else onDirectorAct(s, action.action)
      return s
    case 'seen':
      s.unread[action.chat] = 0
      return s
    case 'decide':
      decide(s, action.lineId, action.decision, action.qty)
      return s
    case 'order':
      createOrder(s, action.lineIds, action.supplierId)
      return s
    case 'ship':
      shipOrder(s, action.orderNo)
      return s
    case 'transfer':
      transfer(s, action.from, action.mat, action.lineIds)
      return s
  }
}

export { DIRECTOR, FOREMAN }
