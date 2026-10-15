import { Fragment, useMemo, useState } from 'react'
import { MAT, OBJ, OBJECTS, PROJECT, REASON, SUPPLIERS, TODAY } from './data'
import type { Action } from './bot'
import {
  availableQty, fmtDate, matStats, planFinish, planStart, stageStats, stageTpl, surplus,
  type ReqLine, type State,
} from './model'
import { fmtQty, rub } from './parser'
import type { Hl } from './Guide'

export type Tab = 'house' | 'need' | 'orders' | 'requests' | 'approvals'

const q = (mat: string, v: number) => fmtQty(v, MAT[mat].unit)

interface Props {
  s: State
  dispatch: (a: Action) => void
  tab: Tab
  setTab: (t: Tab) => void
  houseId: string
  setHouseId: (id: string) => void
  hl?: Hl
  onOpenStage?: (stage: number | null) => void
  only?: boolean // пошаговый режим: вкладки переключает сценарий
}

export function Panel({ s, dispatch, tab, setTab, houseId, setHouseId, hl, onOpenStage, only }: Props) {
  const needCount = s.lines.filter(l => availableQty(l) > 0).length
  const apprCount = s.lines.filter(l => l.approval === 'pending' || l.approval === 'retro').length
  const tabs: [Tab, string, number?][] = [
    ['house', 'Карточка дома'],
    ['need', 'Потребность', needCount],
    ['orders', 'Заказы'],
    ['requests', 'Заявки'],
    ['approvals', 'Согласования', apprCount],
  ]
  return (
    <section className="panel" aria-label="Веб-панель">
      <div className="panel-top" role="tablist">
        <span className="who">Веб-панель</span>
        {tabs.map(([id, label, n]) => (
          <button key={id} className="tab" role="tab" aria-selected={tab === id} disabled={only && tab !== id} onClick={() => setTab(id)}>
            {label}{n ? <span className="badge">{n}</span> : null}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {tab === 'house' && <House s={s} id={houseId} setId={setHouseId} hl={hl} onOpenStage={onOpenStage} />}
        {tab === 'need' && <Need s={s} dispatch={dispatch} hl={hl} />}
        {tab === 'orders' && <Orders s={s} dispatch={dispatch} hl={hl} />}
        {tab === 'requests' && <Requests s={s} />}
        {tab === 'approvals' && <Approvals s={s} dispatch={dispatch} />}
      </div>
    </section>
  )
}

// ---------- Рулетка нормы ----------

export function Ruler({ norm, requested, received, consumed }: { norm: number; requested: number; received: number; consumed: number }) {
  const max = Math.max(norm, requested, received, consumed) * 1.08 || 1
  const pct = (v: number) => `${(v / max) * 100}%`
  const lane = (cls: string, v: number) => (
    <>
      <i className={`lane ${cls}`} style={{ width: pct(Math.min(v, norm || v)) }} />
      {norm > 0 && v > norm && <i className={`lane ${cls} over`} style={{ left: pct(norm), width: pct(v - norm) }} />}
    </>
  )
  return (
    <div className="ruler" role="img" aria-label={`Норма ${norm}, заявлено ${requested}, принято ${received}, израсходовано ${consumed}`}>
      {lane('req', requested)}
      {lane('rec', received)}
      {lane('con', consumed)}
      {norm > 0 && <span className="norm-mark" style={{ left: pct(norm) }} />}
    </div>
  )
}

function RulerLegend() {
  return (
    <div className="legend">
      <span><i style={{ background: 'var(--pine)' }} />заявлено</span>
      <span><i style={{ background: 'var(--blue)' }} />принято на объекте</span>
      <span><i style={{ background: 'var(--graphite)' }} />израсходовано</span>
      <span><i style={{ background: 'var(--red)', width: 2, height: 12 }} />норма</span>
      <span><i style={{ background: 'repeating-linear-gradient(135deg, var(--red) 0 3px, var(--red-soft) 3px 6px)' }} />сверх нормы</span>
    </div>
  )
}

// ---------- Карточка дома ----------

function House({ s, id, setId, hl, onOpenStage }: { s: State; id: string; setId: (id: string) => void; hl?: Hl; onOpenStage?: (stage: number | null) => void }) {
  const o = OBJ[id]
  const [open, setOpenRaw] = useState<number | null>(hl?.panel === 'stage5' ? null : s.activeStage[id])
  const setOpen = (v: number | null) => { setOpenRaw(v); onOpenStage?.(id === 'les12' ? v : null) }
  const stats = PROJECT.stages.map(st => stageStats(s, id, st.no))
  const sum = (k: keyof (typeof stats)[number]) => stats.reduce((a, x) => a + (x[k] as number), 0)
  const norm = sum('normRub'), ordered = sum('orderedRub'), received = sum('receivedRub'), consumed = sum('consumedRub'), over = sum('overRub')
  const closedNorm = stats.filter(x => x.status === 'closed').reduce((a, x) => a + x.normRub, 0)
  const forecast = consumed + stats.filter(x => x.status !== 'closed').reduce((a, x) => a + x.normRub, 0)
  const feed = s.events.filter(e => e.objectId === id).slice(-8).reverse()
  const active = s.activeStage[id]

  return (
    <>
      <div className="objsel" role="group" aria-label="Объект">
        {OBJECTS.map(x => <button key={x.id} aria-pressed={x.id === id} onClick={() => { setId(x.id); setOpen(s.activeStage[x.id]) }}>{x.name}</button>)}
      </div>
      <div className="house-head">
        <div>
          <h3>{o.name}</h3>
          <div className="meta">Проект {PROJECT.name} ({PROJECT.title.toLowerCase()}), норма версии {PROJECT.normVersion}. {o.crew}, старт {fmtDate(o.start)}. Сейчас этап {active} «{stageTpl(active).name}», по плану до {fmtDate(planFinish(id, active))}.</div>
        </div>
      </div>
      <div className="timeline" aria-label="Этапы">
        {PROJECT.stages.map(st => (
          <div key={st.no} className={st.no < active ? 'closed' : st.no === active ? 'active' : ''} title={`${st.no}. ${st.name}`}>{st.no}</div>
        ))}
      </div>
      <div className="ledger">
        <div><small>Норма дома</small><b>{rub(norm)}</b></div>
        <div><small>Заказано</small><b>{rub(ordered)}</b></div>
        <div><small>Принято</small><b>{rub(received)}</b></div>
        <div><small>Израсходовано</small><b>{rub(consumed)}</b></div>
        <div className="neg"><small>Перерасход по закрытым этапам</small><b>{rub(over)}</b>{closedNorm > 0 && <small>{((over / closedNorm) * 100).toFixed(1).replace('.', ',')}% от нормы</small>}</div>
        <div><small>Прогноз материальных затрат</small><b>{rub(forecast)}</b><small>{forecast >= norm ? '+' : ''}{rub(forecast - norm)} к норме</small></div>
      </div>
      {o.customerChanges && (
        <div className="change-note">Изменения покупателя (не считаются перерасходом): {o.customerChanges.map(c => `этап ${c.stage}: ${MAT[c.mat].name} +${q(c.mat, c.delta)}`).join('; ')}. {o.customerChanges[0].note}.</div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Этап</th><th>Статус</th><th>Норма</th><th>Заказано</th><th>Принято</th><th>Израсходовано</th><th>Перерасход</th></tr>
          </thead>
          <tbody>
            {stats.map(x => (
              <Fragment key={x.stage}>
                <tr className={`stage-row ${open === x.stage ? 'open' : ''} ${hl?.panel === 'stage5' && id === 'les12' && x.stage === 5 ? 'hl' : ''}`} onClick={() => setOpen(open === x.stage ? null : x.stage)} aria-expanded={open === x.stage}>
                  <td>{x.stage}. {stageTpl(x.stage).name}</td>
                  <td><span className={`st-pill ${x.status}`}>{x.status === 'closed' ? 'закрыт' : x.status === 'active' ? 'идёт' : `с ${fmtDate(planStart(id, x.stage))}`}</span></td>
                  <td>{rub(x.normRub)}</td>
                  <td>{x.orderedRub ? rub(x.orderedRub) : '—'}</td>
                  <td>{x.receivedRub ? rub(x.receivedRub) : '—'}</td>
                  <td>{x.consumedRub ? rub(x.consumedRub) : '—'}</td>
                  <td className={x.overRub ? 'neg' : 'muted'}>{x.overRub ? `${rub(x.overRub)} (${x.overCount})` : '—'}{x.savingRub ? <div className="pos">−{rub(x.savingRub)}</div> : null}</td>
                </tr>
                {open === x.stage && <StageDetail s={s} id={id} stage={x.stage} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <RulerLegend />
      <div className="cols">
        <Deviations s={s} id={id} />
        <div className="feed" aria-label="Лента событий">
          <h4>Лента событий</h4>
          {feed.length === 0 && <div className="muted">Событий пока нет</div>}
          {feed.map((e, i) => <div key={i}><small>{fmtDate(e.at)}, {e.who}</small>{e.text}</div>)}
        </div>
      </div>
    </>
  )
}

function StageDetail({ s, id, stage }: { s: State; id: string; stage: number }) {
  const rows = matStats(s, id, stage)
  return (
    <>
      {rows.map(r => (
        <tr className="sub" key={r.mat}>
          <td colSpan={2}>
            <div style={{ fontWeight: 600 }}>{MAT[r.mat].name}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>норма {q(r.mat, r.norm)}, на объекте сейчас {q(r.mat, r.balance)}</div>
          </td>
          <td colSpan={3}><Ruler norm={r.norm} requested={r.requested} received={r.received} consumed={r.consumed} /></td>
          <td>
            <div>заявлено {q(r.mat, r.requested)}</div>
            <div>принято {q(r.mat, r.received)}</div>
          </td>
          <td>
            {r.consumed ? <div>расход {q(r.mat, r.consumed)}</div> : <div className="muted">в работе</div>}
            {r.consumed > 0 && r.norm > 0 && r.consumed - r.norm > r.norm * 0.05 && <div className="neg">+{q(r.mat, Math.round((r.consumed - r.norm) * 100) / 100)}</div>}
          </td>
        </tr>
      ))}
    </>
  )
}

function Deviations({ s, id }: { s: State; id: string }) {
  const list = s.variances.filter(v => v.objectId === id && v.kind === 'over' && v.qty > 0)
  const byReason = new Map<string, number>()
  for (const v of list) byReason.set(v.reason ?? 'other', (byReason.get(v.reason ?? 'other') ?? 0) + v.rub)
  const total = [...byReason.values()].reduce((a, b) => a + b, 0)
  return (
    <div>
      <h4 style={{ margin: '0 0 8px' }}>Перерасход по причинам</h4>
      {total === 0 && <div className="muted">Перерасхода по закрытым этапам нет</div>}
      {[...byReason].sort((a, b) => b[1] - a[1]).map(([r, v]) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 90px', gap: 10, alignItems: 'center', fontSize: 14, marginBottom: 6 }}>
          <span>{REASON[r]}</span>
          <span style={{ height: 10, background: 'var(--line-soft)', borderRadius: 3, overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${(v / total) * 100}%`, background: 'var(--red)' }} />
          </span>
          <b style={{ textAlign: 'right' }}>{rub(v)}</b>
        </div>
      ))}
      {list.length > 0 && (
        <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Крупнейшее: {(() => { const v = [...list].sort((a, b) => b.rub - a.rub)[0]; return `${MAT[v.mat].name}, этап ${v.stage}: +${q(v.mat, v.qty)} ≈ ${rub(v.rub)}` })()}
        </div>
      )}
    </div>
  )
}

// ---------- Потребность ----------

function needBy(l: ReqLine) {
  const start = planStart(l.objectId, l.stage)
  return start > TODAY ? `нужно к ${fmtDate(start)}` : 'нужно сейчас'
}

function supplierFor(mat: string) {
  return SUPPLIERS.find(x => x.categories.includes(MAT[mat].category))?.id ?? SUPPLIERS[0].id
}

function Need({ s, dispatch, hl }: { s: State; dispatch: (a: Action) => void; hl?: Hl }) {
  const groups = useMemo(() => {
    const m = new Map<string, ReqLine[]>()
    for (const l of s.lines) if (availableQty(l) > 0 || l.approval === 'pending') {
      const arr = m.get(l.mat) ?? []
      arr.push(l)
      m.set(l.mat, arr)
    }
    return [...m].sort((a, b) => Number(b[1].some(l => l.urgent)) - Number(a[1].some(l => l.urgent)) || MAT[a[0]].category.localeCompare(MAT[b[0]].category))
  }, [s.lines])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [sup, setSup] = useState<string>('')
  const selected = groups.filter(([m]) => sel.has(m))
  const suggested = selected.length ? supplierFor(selected[0][0]) : SUPPLIERS[0].id
  const supplier = sup || suggested
  const toggle = (m: string) => setSel(prev => { const n = new Set(prev); if (n.has(m)) n.delete(m); else n.add(m); return n })

  if (!groups.length) {
    return (
      <>
        <ViewTitle title="Сводная потребность" text="Строки заявок со всех объектов, готовые к закупке, собраны по материалам." />
        <div className="empty"><b>Сейчас нечего закупать</b>{s.orders.some(o => o.demo) ? 'Всё заказано. Новые заявки бригадиров появятся здесь сами.' : 'Отправьте заявку от бригадира в чате — её строки появятся здесь.'}</div>
      </>
    )
  }
  return (
    <>
      <ViewTitle title="Сводная потребность" text="Строки заявок со всех объектов, готовые к закупке, собраны по материалам. Отметьте материалы и создайте заказ одному поставщику. Строки на согласовании ждут решения руководителя." />
      {groups.map(([mat, lines]) => {
        const avail = lines.reduce((a, l) => a + availableQty(l), 0)
        const target = lines[0].objectId
        const donors = OBJECTS.filter(o => o.id !== target && surplus(s, o.id, mat) > 0)
        return (
          <div className="need-group" key={mat}>
            <div className="need-head">
              <label>
                <input type="checkbox" checked={sel.has(mat)} disabled={avail <= 0} onChange={() => toggle(mat)} />
                <span>{MAT[mat].name} <span className="cat">{MAT[mat].category}</span></span>
              </label>
              <span />
              <span className="tot">{avail > 0 ? q(mat, Math.round(avail * 100) / 100) : 'ждёт решения'}</span>
            </div>
            <div className="need-lines">
              {lines.map(l => (
                <div key={l.id}>
                  <span>{OBJ[l.objectId].name}, этап {l.stage}, заявка №{l.reqNo}{l.urgent ? ', срочно' : ''}, {needBy(l)}</span>
                  <span>
                    {availableQty(l) > 0 && <b>{q(mat, availableQty(l))}</b>}
                    {l.approval === 'pending' && <span className="z-yellow"> +{q(mat, l.over)} на согласовании</span>}
                    {l.approval === 'retro' && <span className="z-red"> срочно, согласование задним числом</span>}
                  </span>
                </div>
              ))}
            </div>
            {donors.map(o => (
              <div className="surplus" key={o.id}>
                <span>На {o.name} лишние {q(mat, surplus(s, o.id, mat))} после закрытых этапов — можно перевезти вместо покупки.</span>
                <button className={`btn small ${hl?.panel === 'transfer' ? 'hl' : ''}`} onClick={() => dispatch({ type: 'transfer', from: o.id, mat, lineIds: lines.map(l => l.id) })}>Переместить</button>
              </div>
            ))}
          </div>
        )
      })}
      <div className="orderbar">
        <span>{selected.length ? `Выбрано материалов: ${selected.length}` : 'Отметьте материалы для заказа'}</span>
        <button className={`btn small ${hl?.panel === 'order' && !selected.length ? 'hl' : ''}`} onClick={() => setSel(new Set(groups.filter(([, ls]) => ls.some(l => availableQty(l) > 0)).map(([m]) => m)))}>Отметить всё</button>
        <select value={supplier} onChange={e => setSup(e.target.value)} aria-label="Поставщик">
          {SUPPLIERS.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button
          className={`btn primary small ${hl?.panel === 'order' && selected.length ? 'hl' : ''}`}
          disabled={!selected.length}
          onClick={() => {
            dispatch({ type: 'order', supplierId: supplier, lineIds: selected.flatMap(([, ls]) => ls.map(l => l.id)) })
            setSel(new Set()); setSup('')
          }}
        >Создать заказ</button>
      </div>
    </>
  )
}

// ---------- Заказы ----------

function downloadCsv(s: State, orderNo: number) {
  const o = s.orders.find(x => x.no === orderNo)!
  const sup = SUPPLIERS.find(x => x.id === o.supplierId)!.name
  const rows = [['Заказ №' + o.no, sup, fmtDate(o.at)], [], ['Материал', 'Количество', 'Ед.', 'Цена', 'Сумма', 'Объекты']]
  for (const l of o.lines) rows.push([MAT[l.mat].name, String(l.qty).replace('.', ','), MAT[l.mat].unit, String(l.price), String(Math.round(l.qty * l.price)), l.allocs.map(a => `${OBJ[a.objectId].name}: ${a.qty}`).join('; ')])
  const csv = '﻿' + rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  a.download = `zakaz-${o.no}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function Orders({ s, dispatch, hl }: { s: State; dispatch: (a: Action) => void; hl?: Hl }) {
  const orders = [...s.orders].reverse()
  const transfers = s.shipments.filter(x => x.transferFrom)
  return (
    <>
      <ViewTitle title="Заказы поставщикам" text="Заказ собирается из сводной потребности. Отметка «Отгружено» отправляет бригадиру карточку приёмки в Max; без фото накладной приёмка не закрывается." />
      {!orders.length && !transfers.length && <div className="empty"><b>Заказов пока нет</b>Создайте заказ на вкладке «Потребность».</div>}
      {orders.map(o => {
        const total = o.lines.reduce((a, l) => a + l.qty * l.price, 0)
        const ships = s.shipments.filter(x => x.orderNo === o.no)
        return (
          <div className="ocard" key={o.no}>
            <div className="ocard-head">
              <b>Заказ №{o.no}: {SUPPLIERS.find(x => x.id === o.supplierId)!.name}</b>
              <span>{fmtDate(o.at)}, {o.status === 'sent' ? 'отправлен поставщику' : 'отгружен'}, {rub(total)}</span>
            </div>
            <div className="tbl-wrap">
              <table className="tbl" style={{ minWidth: 560 }}>
                <thead><tr><th>Материал</th><th>Всего</th><th>Цена</th><th>Сумма</th><th>По объектам</th></tr></thead>
                <tbody>
                  {o.lines.map(l => (
                    <tr key={l.mat}>
                      <td>{MAT[l.mat].name}</td><td>{q(l.mat, l.qty)}</td><td>{rub(l.price)}</td><td>{rub(l.qty * l.price)}</td>
                      <td>{l.allocs.map(a => `${OBJ[a.objectId].name} — ${q(l.mat, a.qty)}`).join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ships.map(sh => (
              <div className="ship-st" key={sh.id}>
                {OBJ[sh.objectId].name}: {sh.status === 'expected' ? <span className="z-yellow">ждёт приёмки бригадиром</span> : sh.status === 'accepted' ? <span className="z-green">принято, фото накладной есть</span> : <span className="z-red">принято с расхождением — претензия поставщику: {sh.lines.filter(x => x.accepted < x.qty).map(x => `${MAT[x.mat].name} недовоз ${q(x.mat, Math.round((x.qty - x.accepted) * 100) / 100)}`).join('; ')}</span>}
              </div>
            ))}
            <div className="actions">
              <button className="btn small" onClick={() => downloadCsv(s, o.no)}>Скачать для поставщика (Excel)</button>
              {o.status === 'sent' && <button className={`btn small primary ${hl?.panel === 'ship' ? 'hl' : ''}`} onClick={() => dispatch({ type: 'ship', orderNo: o.no })}>Отгружено на объект</button>}
            </div>
          </div>
        )
      })}
      {transfers.map(sh => (
        <div className="ocard" key={sh.id}>
          <div className="ocard-head"><b>Перемещение: {OBJ[sh.transferFrom!].name} → {OBJ[sh.objectId].name}</b><span>вместо покупки</span></div>
          {sh.lines.map(l => <div key={l.mat}>{MAT[l.mat].name} — {q(l.mat, l.qty)}</div>)}
          <div className="ship-st">{sh.status === 'expected' ? <span className="z-yellow">ждёт приёмки бригадиром</span> : <span className="z-green">принято, фото есть</span>}</div>
        </div>
      ))}
    </>
  )
}

// ---------- Журнал заявок ----------

function Requests({ s }: { s: State }) {
  const reqs = [...s.reqs].reverse().slice(0, 14)
  return (
    <>
      <ViewTitle title="Журнал заявок" text="Каждая заявка хранит исходный текст бригадира, распознанные строки, сверку с нормой на момент отправки и решения по перерасходу." />
      <div className="tbl-wrap">
        <table className="tbl">
          <thead><tr><th>№</th><th>Объект и автор</th><th className="left">Что написал бригадир и как система поняла</th><th>Статус</th></tr></thead>
          <tbody>
            {reqs.map(r => {
              const ls = s.lines.filter(l => l.reqNo === r.no)
              return (
                <tr key={r.no}>
                  <td><b>{r.no}</b><div className="muted">{fmtDate(r.at)}</div></td>
                  <td style={{ textAlign: 'left' }}>{OBJ[r.objectId].name}<div className="muted">{r.author}{r.urgent ? ', срочная' : ''}</div></td>
                  <td className="left">
                    {r.source !== 'seed' && <div className="raw">«{r.raw}»</div>}
                    {ls.map(l => (
                      <div key={l.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                        <span className={`dot ${l.zone}`} />
                        <span>{MAT[l.mat].name} — {q(l.mat, l.qty)}, этап {l.stage}{l.over > 0 ? `, сверх нормы +${q(l.mat, l.over)} (${REASON[l.reason ?? ''] ?? 'без причины'})` : ''}</span>
                      </div>
                    ))}
                  </td>
                  <td>{status(ls)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function status(ls: ReqLine[]) {
  if (ls.some(l => l.approval === 'pending')) return <span className="z-yellow">на согласовании</span>
  if (ls.every(l => l.ordered > 0 && l.received >= l.ordered && availableQty(l) === 0)) return <span className="z-green">принята на объекте</span>
  if (ls.some(l => l.ordered > 0)) return 'заказана'
  return 'у снабженца'
}

// ---------- Согласования ----------

function Approvals({ s, dispatch }: { s: State; dispatch: (a: Action) => void }) {
  const pending = s.lines.filter(l => l.approval === 'pending' || l.approval === 'retro')
  const decided = s.lines.filter(l => l.demo && ['approved', 'reduced', 'rejected'].includes(l.approval) && l.zone === 'red')
  const [qty, setQty] = useState<Record<string, string>>({})
  return (
    <>
      <ViewTitle title="Согласование перерасхода" text="Сюда попадает только крупный перерасход сверх нормы. Небольшой проходит сразу и виден в сводке. То же самое руководитель делает кнопками в Max." />
      {!pending.length && <div className="empty"><b>Нет перерасхода на согласовании</b>Отправьте от бригадира заявку больше нормы — например, «брус 150 на 150 двадцать штук» на Лесную, 12.</div>}
      {pending.map(l => (
        <div className="acard" key={l.id}>
          <div>
            <b>{OBJ[l.objectId].name}: {MAT[l.mat].name} +{q(l.mat, l.over)} ≈ {rub(l.overRub)}</b>
            <div className="muted">Этап {l.stage} «{stageTpl(l.stage).name}», заявка №{l.reqNo}, норма этапа {q(l.mat, l.normAt)}{l.approval === 'retro' ? ', срочная — уже в закупке' : ''}</div>
            <div>Причина: {REASON[l.reason ?? ''] ?? '—'}{l.comment ? ` — «${l.comment}»` : ''}</div>
          </div>
          <div className="actions">
            <button className="btn small primary" onClick={() => dispatch({ type: 'decide', lineId: l.id, decision: 'approve' })}>Согласовать</button>
            <input inputMode="decimal" placeholder={String(l.over)} value={qty[l.id] ?? ''} onChange={e => setQty({ ...qty, [l.id]: e.target.value })} aria-label="Сколько согласовать" />
            <button className="btn small" onClick={() => dispatch({ type: 'decide', lineId: l.id, decision: 'reduce', qty: parseFloat((qty[l.id] || '0').replace(',', '.')) })}>Уменьшить</button>
            <button className="btn small" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => dispatch({ type: 'decide', lineId: l.id, decision: 'reject' })}>Отклонить</button>
          </div>
        </div>
      ))}
      {decided.length > 0 && (
        <>
          <h4 style={{ margin: '22px 0 8px' }}>Решения в демо</h4>
          {decided.map(l => (
            <div key={l.id} style={{ fontSize: 14, padding: '4px 0' }}>
              {OBJ[l.objectId].name}: {MAT[l.mat].name} +{q(l.mat, l.over)} — {l.approval === 'approved' ? 'согласовано' : l.approval === 'rejected' ? 'отклонено' : `согласовано +${q(l.mat, l.approvedOver ?? 0)}`}
            </div>
          ))}
        </>
      )}
    </>
  )
}

function ViewTitle({ title, text }: { title: string; text: string }) {
  return <div className="view-title"><div><h3>{title}</h3><p>{text}</p></div></div>
}
