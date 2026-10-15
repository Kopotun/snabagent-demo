import { FOREMAN_OBJECTS, MAT, OBJ, OBJECTS, REASON, SUPPLIERS } from './data'
import { availableQty, forgotten, stageTpl, surplus, type Card, type ChatId, type State } from './model'
import type { Tab } from './Panel'
import { fmtQty, rub } from './parser'

// Пошаговый показ: каждый шаг — один экран, список действий с подсветкой и объяснение, что произошло в системе.

export const SAMPLE_REQUEST = 'На Лесную 12: брус 150 на 150 двадцать штук, доски пятидесятки 2,7 куба, гвозди мешок, пены пару баллонов'
export const SAMPLE_LEFTOVERS = 'брус 1, доска 0,2'

export interface Hl {
  chip?: string
  action?: (a: string) => boolean
  send?: boolean
  attach?: boolean
  panel?: string // ключ подсветки в панели: transfer, checkall, order, ship, stage5
}

export interface Ctx { s: State; text: string; opened5: boolean }
interface Task { text: string; done: boolean; hl?: Hl }

export interface Step {
  short: string
  title: string
  who: string
  intro: string
  screen: { kind: 'phone'; chat: ChatId } | { kind: 'panel'; tab: Tab }
  tasks: (c: Ctx) => Task[]
  done: (c: Ctx) => boolean
  result: (c: Ctx) => string[]
  tip?: string
  stuck?: (c: Ctx) => string | undefined
}

const q = (mat: string, v: number) => fmtQty(v, MAT[mat].unit)
const low = (mat: string) => MAT[mat].name.replace(/, рулон.*$/, '').replace(/^./, c => c.toLowerCase())

function lastDraft(s: State): Extract<Card, { type: 'draft' }> | undefined {
  for (let i = s.chats.foreman.length - 1; i >= 0; i--) {
    const c = s.chats.foreman.at(i)?.card
    if (c?.type === 'draft') return c
  }
  return undefined
}
const submitted = (s: State) => s.reqs.some(r => r.demo)
const lastReq = (s: State) => [...s.reqs].reverse().find(r => r.demo)
const demoOrders = (s: State) => s.orders.filter(o => o.demo)
const expectedForeman = (s: State) => s.shipments.filter(x => x.status === 'expected' && FOREMAN_OBJECTS.includes(x.objectId))
const pendingRed = (s: State) => s.lines.filter(l => l.demo && (l.approval === 'pending' || l.approval === 'retro'))
const surplusAvailable = (s: State) =>
  s.lines.some(l => availableQty(l) > 0 && OBJECTS.some(o => o.id !== l.objectId && surplus(s, o.id, l.mat) > 0))

export const STEPS: Step[] = [
  {
    short: 'Заявка',
    title: 'Бригадир пишет заявку',
    who: 'Вы — бригадир Сергей Котов',
    intro: 'Дом на Лесной, 12 сейчас на этапе 5 «Каркас стен». Нужны материалы — вы пишете боту в Max так же, как раньше писали снабженцу: своими словами, без выбора из списков.',
    screen: { kind: 'phone', chat: 'foreman' },
    tasks: ({ s, text }) => {
      const sent = !!lastDraft(s) || submitted(s)
      return [
        { text: 'Нажмите «Вставить пример заявки» под чатом — в поле появится типичная заявка', done: sent || text.trim().length > 0, hl: { chip: 'Вставить пример заявки' } },
        { text: 'Отправьте сообщение синей кнопкой со стрелкой', done: sent, hl: { send: true } },
      ]
    },
    done: ({ s }) => !!lastDraft(s) || submitted(s),
    result: ({ s }) => {
      const d = lastDraft(s)
      if (!d) return ['Заявка уже отправлена.']
      const lines = d.draft.lines
      const red = lines.filter(l => d.evals[l.key]?.zone === 'red')
      const yellow = lines.filter(l => d.evals[l.key]?.zone === 'yellow')
      const unclear = lines.filter(l => !l.mat)
      const out = [`Бот разобрал обычный текст на ${lines.length} позиции и нашёл каждую в справочнике материалов, хотя написано было «брус 150 на 150» и «пятидесятка».`]
      for (const l of red) { const e = d.evals[l.key]; out.push(`${MAT[l.mat!].name}: просят ${q(l.mat!, l.qty)}, а по норме осталось ${q(l.mat!, Math.max(0, e.remaining))}. Перебор ${q(l.mat!, e.over)} на ${rub(e.overRub)} — красная зона, это решит руководитель.`) }
      if (yellow.length) out.push(`Небольшой перебор, жёлтая зона: ${yellow.map(l => low(l.mat!)).join(', ')}. Нужна только причина, руководителя не дёргаем.`)
      if (unclear.length) out.push(`«${unclear[0].raw}» — бот не уверен, какая именно позиция, и спрашивает кнопками, а не угадывает.`)
      if (d.forgotten.length) out.push(`Внизу черновика — что по этому этапу ещё ни разу не заказывали: ${d.forgotten.map(([m]) => low(m)).join(', ')}.`)
      out.push('Пока это только черновик: снабженец ничего не получил, пока бригадир не нажмёт «Отправить».')
      return out
    },
  },
  {
    short: 'Уточнение',
    title: 'Бригадир уточняет черновик',
    who: 'Вы — бригадир',
    intro: 'Бот спросил, какая нужна пена, и подсказал забытые позиции. Ответьте кнопками — набирать ничего не нужно.',
    screen: { kind: 'phone', chat: 'foreman' },
    tasks: ({ s }) => {
      const d = s.draft
      const sent = submitted(s)
      const unclear = d?.lines.some(l => !l.mat && l.options) ?? false
      const fg = d ? !d.forgottenAdded && forgotten(s, d).length > 0 : false
      return [
        { text: 'Выберите пену: нажмите «Пена монтажная 750 мл»', done: sent || (!!d && !unclear), hl: { action: a => a.startsWith('pick:') && a.endsWith(':pena750') } },
        { text: 'Нажмите «Добавить забытое» — бот допишет недостающее по норме этапа', done: sent || (!!d && !fg), hl: { action: a => a === 'draft:forgotten' } },
      ]
    },
    done: ({ s }) => submitted(s) || (!!s.draft && !s.draft.lines.some(l => !l.mat && l.options) && (s.draft.forgottenAdded || forgotten(s, s.draft).length === 0)),
    result: ({ s }) => {
      const d = lastDraft(s)
      const added = d?.draft.forgottenAdded ? d.draft.lines.filter(l => l.raw === MAT[l.mat ?? '']?.name && d.draft.source === 'text') : []
      return [
        'Бот запомнил, что «пена» у этого бригадира — монтажная 750 мл. В следующий раз он не переспросит: справочник синонимов пополняется сам с каждым ответом.',
        added.length ? `В черновик добавились ${added.map(l => `${low(l.mat!)} — ${q(l.mat!, l.qty)}`).join(', ')}: ровно столько, сколько осталось по норме.` : 'Черновик дополнен позициями, которые по норме этапа ещё не заказывали.',
        'Черновик можно править и текстом: «брус 18» или «убери пену».',
      ]
    },
    tip: 'Можно попробовать написать в чат «брус 18» — бот поправит количество в черновике.',
    stuck: ({ s }) => (!s.draft && !submitted(s) && s.flow.kind !== 'reasons' ? 'Черновика нет — похоже, его отменили. Отправьте заявку заново на шаге 1.' : undefined),
  },
  {
    short: 'Отправка',
    title: 'Бригадир отправляет заявку',
    who: 'Вы — бригадир',
    stuck: ({ s }) => (!s.draft && !submitted(s) && s.flow.kind !== 'reasons' ? 'Черновика нет — похоже, его отменили. Отправьте заявку заново на шаге 1.' : undefined),
    intro: 'Отправляем. По каждой позиции сверх нормы бот спросит причину — это главный источник аналитики: не только сколько перерасходовали, но и почему.',
    screen: { kind: 'phone', chat: 'foreman' },
    tasks: ({ s }) => [
      { text: 'Нажмите «Отправить» под черновиком', done: submitted(s) || s.flow.kind === 'reasons', hl: { action: a => a === 'draft:send' } },
      { text: 'Укажите причину перебора по каждой позиции: кнопкой или своими словами, например «две доски кривые пришли»', done: submitted(s), hl: { action: a => a.startsWith('reason:') } },
    ],
    done: ({ s }) => submitted(s),
    result: ({ s }) => {
      const r = lastReq(s)
      if (!r) return []
      const ls = s.lines.filter(l => l.reqNo === r.no)
      const red = ls.filter(l => l.zone === 'red')
      const out = [`Заявка получила номер №${r.no}. По этому номеру её видно везде: в чате, у снабженца, в заказе и в карточке дома.`]
      out.push(`${ls.filter(l => l.zone !== 'red').length} позиций сразу появились у снабженца в сводной потребности.`)
      for (const l of red) out.push(`${MAT[l.mat].name}: ${q(l.mat, l.qty - l.over)} по норме уже доступны для закупки, а перебор ${q(l.mat, l.over)} ждёт решения. Руководителю в Max ушла карточка с суммой и причиной «${REASON[l.reason ?? ''] ?? '—'}».`)
      out.push('Бригада не стоит: ждёт только спорная часть. Если срочно, есть кнопка «Срочно, бригада стоит» — тогда всё уходит в закупку сразу, а согласование задним числом.')
      return out
    },
  },
  {
    short: 'Согласование',
    title: 'Руководитель решает по перерасходу',
    who: 'Вы — руководитель',
    intro: 'Вам в Max пришла карточка: что просят сверх нормы, на какую сумму, сколько процентов к норме и почему. Мелкий перебор сюда не попадает — только крупный.',
    screen: { kind: 'phone', chat: 'director' },
    tasks: ({ s }) => [
      { text: 'Нажмите «Согласовать». Или «Уменьшить» и напишите в чат, сколько разрешить', done: submitted(s) && pendingRed(s).length === 0, hl: { action: a => a.startsWith('dir:approve') || a.startsWith('dir:reduce') } },
    ],
    done: ({ s }) => submitted(s) && pendingRed(s).length === 0,
    result: ({ s }) => {
      const decided = s.lines.filter(l => l.demo && l.zone === 'red')
      if (!decided.length) return ['Крупного перерасхода в этой заявке не было — согласование не понадобилось.']
      const l = decided[0]
      const what = l.approval === 'approved' ? `согласовал +${q(l.mat, l.over)}` : l.approval === 'reduced' ? `согласовал +${q(l.mat, l.approvedOver ?? 0)} из +${q(l.mat, l.over)}` : 'отклонил перебор'
      return [
        `Руководитель ${what}. Бригадир сразу получил об этом сообщение в Max.`,
        'Согласованная часть стала доступна снабженцу для заказа.',
        'Решение записано в истории заявки и попадёт в сводку за день — её можно запросить кнопкой «Сводка за день».',
      ]
    },
  },
  {
    short: 'Заказ',
    title: 'Снабженец заказывает материалы',
    who: 'Вы — снабженец',
    intro: 'Вместо переписки с бригадирами — одна таблица: заявки со всех домов, собранные по материалам. Система ещё и подсказывает, где лишний материал уже лежит.',
    screen: { kind: 'panel', tab: 'need' },
    tasks: ({ s }) => {
      const ordered = demoOrders(s).length > 0
      const moved = s.shipments.some(x => x.transferFrom)
      return [
        { text: 'Нажмите «Переместить» у бруса: на Лесной, 14 после закрытых этапов лежат лишние 4 шт — их не нужно покупать', done: ordered || moved || !surplusAvailable(s), hl: { panel: 'transfer' } },
        { text: 'Нажмите «Отметить всё», затем «Создать заказ»', done: ordered, hl: { panel: 'order' } },
      ]
    },
    done: ({ s }) => demoOrders(s).length > 0,
    result: ({ s }) => {
      const o = demoOrders(s).at(-1)
      if (!o) return []
      const total = o.lines.reduce((a, l) => a + l.qty * l.price, 0)
      const out = [`Заказ №${o.no} поставщику «${SUPPLIERS.find(x => x.id === o.supplierId)!.name.replace(/[«»]/g, '')}» на ${rub(total)} собран из ${o.lines.length} позиций. Excel для поставщика выгружается одной кнопкой.`]
      const tr = s.shipments.find(x => x.transferFrom)
      if (tr) out.push(`${MAT[tr.lines[0].mat].name}: ${q(tr.lines[0].mat, tr.lines[0].qty)} поедут с ${OBJ[tr.transferFrom!].name} — это ${rub(tr.lines[0].qty * MAT[tr.lines[0].mat].price)}, которые не потратили на покупку.`)
      out.push('Бригадир получил в Max: что заказано и когда ориентировочно привезут. Звонить снабженцу не нужно.')
      return out
    },
  },
  {
    short: 'Отгрузка',
    title: 'Поставщик отгрузил',
    who: 'Вы — снабженец',
    intro: 'Поставщик сообщил, что машина выехала. Снабженец отмечает это в заказе — и бригадиру сразу уходит карточка приёмки.',
    screen: { kind: 'panel', tab: 'orders' },
    tasks: ({ s }) => [
      { text: 'Нажмите «Отгружено на объект» в заказе', done: demoOrders(s).length > 0 && demoOrders(s).every(o => o.status === 'shipped'), hl: { panel: 'ship' } },
    ],
    done: ({ s }) => demoOrders(s).length > 0 && demoOrders(s).every(o => o.status === 'shipped'),
    result: () => [
      'Заказ перешёл в статус «отгружен».',
      'Бригадиру Лесной, 12 в Max пришла карточка: что едет и сколько. Если было перемещение с соседнего дома, по нему тоже пришла карточка.',
    ],
  },
  {
    short: 'Приёмка',
    title: 'Бригадир принимает материал',
    who: 'Вы — бригадир',
    intro: 'Машина приехала. Принимаете материал прямо в чате. Фото накладной обязательно — без него приёмка не закроется.',
    screen: { kind: 'phone', chat: 'foreman' },
    tasks: ({ s }) => {
      const exp = expectedForeman(s).length
      const inPhoto = s.flow.kind === 'acceptPhoto' || s.flow.kind === 'acceptDiscrepancy'
      return [
        { text: 'Нажмите «Принято всё» в карточке поставки (или «Есть расхождение», если чего-то не хватает)', done: exp === 0 || inPhoto, hl: { action: a => a.startsWith('ship:') } },
        { text: 'Нажмите скрепку слева от поля ввода — прикрепится фото накладной', done: exp === 0 && !inPhoto, hl: { attach: true } },
      ]
    },
    done: ({ s }) => s.shipments.some(x => x.status !== 'expected') && expectedForeman(s).length === 0 && s.flow.kind !== 'acceptPhoto',
    result: ({ s }) => {
      const disc = s.shipments.some(x => x.status === 'discrepancy')
      return [
        'Материал оприходован на объект: система знает, что сейчас лежит на Лесной, 12.',
        'Фото накладной хранится вместе с приёмкой — при споре с поставщиком есть доказательство.',
        disc ? 'Расхождение ушло снабженцу задачей на претензию поставщику.' : 'Если бы чего-то не хватило, снабженец получил бы задачу на претензию поставщику.',
        'В заявке у бригадира теперь статус «принята на объекте».',
      ]
    },
    tip: 'Если поставок было две — заказ и перемещение — примите обе по очереди.',
  },
  {
    short: 'Этап',
    title: 'Бригадир закрывает этап',
    who: 'Вы — бригадир',
    intro: 'Каркас стен готов. Бот подсказывает, сколько материала должно остаться по норме, а бригадир пишет, сколько осталось на самом деле. Разница — это настоящий перерасход или экономия.',
    screen: { kind: 'phone', chat: 'foreman' },
    tasks: ({ s, text }) => {
      const closed = s.closes.some(c => c.demo)
      const f = s.flow.kind
      const pickHl: Hl = f === 'pickObject' ? { action: a => a === 'obj:close:les12' } : f === 'closing' && s.flow.kind === 'closing' && s.flow.confirmShort ? { action: a => a === 'close:force' } : { chip: 'Закрыть этап' }
      return [
        { text: 'Нажмите «Закрыть этап» под чатом и выберите «Лесная, 12»', done: closed || (f === 'closing' && !(s.flow.kind === 'closing' && s.flow.confirmShort)) || f === 'closingReasons', hl: pickHl },
        { text: `Нажмите «Вставить остатки» (бригадир пересчитал: «${SAMPLE_LEFTOVERS}») и отправьте`, done: closed || f === 'closingReasons', hl: text.trim() ? { send: true } : { chip: 'Вставить остатки' } },
        { text: 'Укажите причину перерасхода', done: closed, hl: { action: a => a.startsWith('creason:') } },
      ]
    },
    done: ({ s }) => s.closes.some(c => c.demo),
    result: ({ s }) => {
      const c = s.closes.find(x => x.demo)
      if (!c) return []
      const out = ['Расход этапа = сколько было на объекте минус сколько осталось после работ. Это настоящий факт, а не «сколько заказали».']
      for (const r of c.rows.filter(r => MAT[r.mat].key)) {
        const dev = r.deviation
        out.push(`${MAT[r.mat].name}: израсходовано ${q(r.mat, r.consumption)} при норме ${q(r.mat, r.norm)}${dev > r.norm * 0.05 ? ` — перерасход ${q(r.mat, dev)} ≈ ${rub(dev * MAT[r.mat].price)}` : ' — в пределах нормы'}.`)
      }
      out.push(`Руководитель получил итог этапа в Max. Текущим стал этап ${c.stage + 1} «${stageTpl(c.stage + 1).name}».`)
      return out
    },
  },
  {
    short: 'Дом',
    title: 'Руководитель смотрит карточку дома',
    who: 'Вы — руководитель или владелец',
    intro: 'Всё, что произошло, сложилось в одну картину по дому: норма, сколько заказали, приняли и израсходовали, и сколько денег ушло сверх нормы — по каждому этапу.',
    screen: { kind: 'panel', tab: 'house' },
    tasks: ({ opened5 }) => [
      { text: 'Нажмите на строку «5. Каркас стен» в таблице этапов', done: opened5, hl: { panel: 'stage5' } },
    ],
    done: ({ opened5 }) => opened5,
    result: () => [
      'По каждому материалу — «рулетка нормы»: жёлтая полоса — заявлено, синяя — принято, чёрная — израсходовано, красная черта — норма. Всё, что за чертой, — перерасход.',
      'Ниже — перерасход по причинам за весь дом и лента событий: кто, что и когда сделал.',
      'Это и есть вся цепочка: от сообщения бригадира в Max до денег по дому — в одной системе.',
    ],
  },
]

// ---------- Компоненты ----------

function Lock() {
  return <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
}

export function Stepper({ step, maxDone }: { step: number; maxDone: number }) {
  return (
    <ol className="stepper" aria-label="Шаги демо">
      {STEPS.map((st, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'locked'
        return (
          <li key={st.short} className={state} aria-current={i === step ? 'step' : undefined}>
            <span className="num">{state === 'done' ? '✓' : state === 'locked' && i > maxDone ? <Lock /> : i + 1}</span>
            <span className="lbl">{st.short}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function GuideCard({ step, ctx, onNext, onRestart, onFree, onGoto }: { step: number; ctx: Ctx; onNext: () => void; onRestart: () => void; onFree: () => void; onGoto: (i: number) => void }) {
  const st = STEPS[step]
  const tasks = st.tasks(ctx)
  const current = tasks.findIndex(t => !t.done)
  const done = st.done(ctx)
  const last = step === STEPS.length - 1
  const stuck = !done ? st.stuck?.(ctx) : undefined
  if (stuck) {
    return (
      <div className="guide-card">
        <div className="g-count">Шаг {step + 1} из {STEPS.length}</div>
        <h3>{st.title}</h3>
        <p className="g-intro">{stuck}</p>
        <button className="btn primary" onClick={() => onGoto(0)}>Вернуться к шагу 1</button>
      </div>
    )
  }
  return (
    <div className="guide-card">
      <div className="g-count">Шаг {step + 1} из {STEPS.length}</div>
      <h3>{st.title}</h3>
      <div className="g-who">{st.who}</div>
      <p className="g-intro">{st.intro}</p>
      <ol className="g-tasks">
        {tasks.map((t, i) => (
          <li key={i} className={t.done ? 'done' : i === current ? 'now' : ''}>
            <span className="tick" aria-hidden>{t.done ? '✓' : i + 1}</span>
            <span>{t.text}{i === current && !done && <em> — кнопка подсвечена</em>}</span>
          </li>
        ))}
      </ol>
      {st.tip && !done && <p className="g-tip">{st.tip}</p>}
      {done && (
        <div className="g-result" role="status">
          <b>Что произошло в системе</b>
          <ul>{st.result(ctx).map((r, i) => <li key={i}>{r}</li>)}</ul>
          {!last && <button className="btn primary" onClick={onNext}>Следующий шаг: {STEPS[step + 1].title.toLowerCase()}</button>}
          {last && (
            <div className="g-final">
              <button className="btn primary" onClick={onRestart}>Пройти заново</button>
              <button className="btn" onClick={onFree}>Свободный режим</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function currentHl(step: number, ctx: Ctx): Hl {
  const st = STEPS[step]
  if (st.done(ctx)) return {}
  return st.tasks(ctx).find(t => !t.done)?.hl ?? {}
}
