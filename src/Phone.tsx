import { useEffect, useRef, useState } from 'react'
import { MAT, OBJ, REASON } from './data'
import { fmtDate, planFinish, stageTpl, type Card, type ChatId, type Msg, type State } from './model'
import { fmtQty, rub } from './parser'

const q = (mat: string, v: number) => fmtQty(v, MAT[mat].unit)

export interface Chip { label: string; onClick: () => void; accent?: boolean }

interface Props {
  s: State
  chat: ChatId
  messages?: Msg[]
  typing?: boolean
  scriptedTyping?: boolean
  onSend?: (text: string) => void
  onPress?: (msg: Msg, action: string, label: string) => void
  onPhoto?: () => void
  chips?: Chip[]
  draftText?: string
  setDraftText?: (t: string) => void
  photoWanted?: boolean
}

export function Phone({ s, chat, messages, typing, scriptedTyping, onSend, onPress, onPhoto, chips, draftText, setDraftText, photoWanted }: Props) {
  const list = messages ?? s.chats[chat]
  const ref = useRef<HTMLDivElement>(null)
  const [local, setLocal] = useState('')
  const text = draftText ?? local
  const setText = setDraftText ?? setLocal
  const interactive = !!onSend

  useEffect(() => {
    const el = ref.current
    if (el && interactive) el.scrollTop = el.scrollHeight
  }, [list.length, typing, interactive])

  const send = () => {
    const t = text.trim()
    if (!t || !onSend) return
    onSend(t)
    setText('')
  }

  return (
    <div className="phone" aria-label={chat === 'foreman' ? 'Чат бригадира с ботом' : 'Чат руководителя с ботом'}>
      <div className="phone-head">
        <div className="ava" aria-hidden>СА</div>
        <div>
          <b>СнабАгент</b>
          <small>{chat === 'foreman' ? 'бот в Max, вы — бригадир Сергей Котов' : 'бот в Max, вы — руководитель Андрей Лебедев'}</small>
        </div>
      </div>
      <div className="msgs" ref={ref} role="log" aria-live="polite">
        {list.map(m => <MessageView key={m.id} m={m} s={s} onPress={onPress} />)}
        {scriptedTyping && <div className="typing scripted" aria-hidden><span /><span /><span /></div>}
        {typing && <div className="typing" aria-label="Бот печатает"><span /><span /><span /></div>}
      </div>
      {interactive && (
        <>
          {chips && chips.length > 0 && (
            <div className="chips">
              {chips.map(c => <button key={c.label} className={c.accent ? 'accent' : ''} onClick={c.onClick}>{c.label}</button>)}
            </div>
          )}
          <div className="composer">
            {onPhoto && (
              <button className={`icon-btn ${photoWanted ? 'attn' : ''}`} onClick={onPhoto} aria-label="Прикрепить фото" title="Прикрепить фото">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 11.5 12.5 20a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L15.5 7.5" /></svg>
              </button>
            )}
            <input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send() }}
              placeholder={chat === 'foreman' ? 'Напишите заявку…' : 'Сообщение…'}
              aria-label="Текст сообщения"
            />
            <button className="icon-btn send" onClick={send} aria-label="Отправить">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h15M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function MessageView({ m, s, onPress }: { m: Msg; s: State; onPress?: Props['onPress'] }) {
  return (
    <div className={`msg ${m.from}`}>
      {m.photo ? (
        <div className="bubble"><PhotoStub /><span className="time">{m.time}</span></div>
      ) : (
        <>
          {m.text && <div className="bubble">{m.text}{!m.card && <span className="time">{m.time}</span>}</div>}
          {m.card && <CardView card={m.card} s={s} time={m.time} />}
        </>
      )}
      {m.buttons && (
        <div className="kb">
          {m.buttons.map((row, i) => (
            <div className="kb-row" key={i}>
              {row.map(b => (
                <button
                  key={b.action}
                  className={`${b.tone ?? ''} ${m.chosen === b.action ? 'chosen' : ''}`}
                  disabled={m.used || !onPress}
                  onClick={() => onPress?.(m, b.action, b.label)}
                >{b.label}</button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function PhotoStub() {
  return (
    <svg className="photo-thumb" viewBox="0 0 180 120" role="img" aria-label="Фото накладной">
      <rect width="180" height="120" fill="#9aa59b" />
      <rect x="28" y="10" width="112" height="104" fill="#fbfbf7" transform="rotate(-4 84 62)" />
      <g transform="rotate(-4 84 62)" fill="#4b555d">
        <rect x="40" y="22" width="60" height="5" /><rect x="40" y="34" width="86" height="3" /><rect x="40" y="42" width="80" height="3" />
        <rect x="40" y="50" width="84" height="3" /><rect x="40" y="58" width="70" height="3" /><rect x="40" y="66" width="82" height="3" />
        <rect x="88" y="92" width="38" height="3" /><circle cx="60" cy="94" r="10" fill="none" stroke="#1d4c8f" strokeWidth="2" />
      </g>
    </svg>
  )
}

function CardView({ card, s, time }: { card: Card; s: State; time: string }) {
  if (card.type === 'draft') return <DraftCard card={card} time={time} />
  if (card.type === 'approval') return <ApprovalCard s={s} lineId={card.lineId} time={time} />
  if (card.type === 'shipment') return <ShipmentCard s={s} id={card.shipmentId} time={time} />
  if (card.type === 'closing') {
    return (
      <div className="card">
        <div className="card-title">Остатки по {`этапу ${card.stage}`}</div>
        <div className="card-sub">{OBJ[card.objectId].name}, «{stageTpl(card.stage).name}»</div>
        <table>
          <thead><tr><th>Материал</th><th>На объекте</th><th>Норма этапа</th><th>Должно остаться</th></tr></thead>
          <tbody>
            {card.rows.map(r => (
              <tr key={r.mat}>
                <td>{MAT[r.mat].name}{MAT[r.mat].key ? ' •' : ''}</td>
                <td>{q(r.mat, r.before)}</td><td>{q(r.mat, r.norm)}</td><td><b>{q(r.mat, r.expected)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card-sub" style={{ marginTop: 6 }}>• — ключевые материалы, их пересчитываем обязательно</div>
        <span className="time">{time}</span>
      </div>
    )
  }
  return (
    <div className="card">
      <div className="card-title" style={{ marginBottom: 6 }}>{card.title}</div>
      {card.rows.length === 0 && <div className="muted">Пока пусто</div>}
      {card.rows.map((r, i) => (
        <div className="list-row" key={i}><span className={`dot ${r.tone ?? 'muted'}`} />{r.text}</div>
      ))}
      <span className="time">{time}</span>
    </div>
  )
}

function DraftCard({ card, time }: { card: Extract<Card, { type: 'draft' }>; time: string }) {
  const d = card.draft
  const st = d.lines[0]?.stage
  return (
    <div className={`card ${card.outdated ? 'outdated' : ''}`}>
      <div className="card-title">{card.outdated ? 'Черновик (обновлён ниже)' : 'Черновик заявки'}</div>
      <div className="card-sub">{OBJ[d.objectId].name}{st ? `, этап ${st} «${stageTpl(st).name}» до ${fmtDate(planFinish(d.objectId, st))}` : ''}</div>
      {d.lines.map(l => {
        if (!l.mat) {
          return (
            <div className="dline" key={l.key}>
              <div className="dline-top"><span className="dline-name">«{l.raw}»</span><span className="dline-qty">{l.qtyInput}{l.unitInput ? ` ${l.unitInput}` : ''}</span></div>
              <div className="dline-st z-yellow"><span className="dot yellow" />{l.options ? 'уточните ниже, что именно' : 'не узнал — передам снабженцу'}</div>
            </div>
          )
        }
        const ev = card.evals[l.key]
        const unit = MAT[l.mat].unit
        const conv = l.unitInput && l.unitInput !== unit ? `${l.qtyInput} ${l.unitInput} = ${q(l.mat, l.qty)}` : ''
        const rest = Math.max(0, ev?.remaining ?? 0)
        const scale = Math.max(rest, l.qty) || 1
        return (
          <div className="dline" key={l.key}>
            <div className="dline-top"><span className="dline-name">{MAT[l.mat].name}</span><span className="dline-qty">{q(l.mat, l.qty)}</span></div>
            {conv && <div className="dline-conv">{conv}</div>}
            {ev && (
              <>
                <div className={`dline-st z-${ev.zone}`}>
                  <span className={`dot ${ev.zone}`} />
                  {ev.zone === 'green' && `в норме, осталось по норме ${q(l.mat, rest)}`}
                  {ev.zone === 'yellow' && `сверх нормы +${q(l.mat, ev.over)} (${rub(ev.overRub)}), без согласования`}
                  {ev.zone === 'red' && (ev.norm === 0 ? `нет в норме этапа (${rub(ev.overRub)}), на согласование` : `сверх нормы +${q(l.mat, ev.over)} (${rub(ev.overRub)}), на согласование`)}
                </div>
                <div className="mini" aria-hidden>
                  <i style={{ width: `${(Math.min(l.qty, rest) / scale) * 100}%`, background: 'var(--green)' }} />
                  {ev.over > 0 && <i className="lane over" style={{ left: `${(rest / scale) * 100}%`, width: `${(ev.over / scale) * 100}%`, height: '100%' }} />}
                </div>
              </>
            )}
            {l.note && <div className="dline-note">{l.note}</div>}
          </div>
        )
      })}
      {card.forgotten.length > 0 && !card.outdated && (
        <div className="forgot">По этому этапу ещё не заказывали: {card.forgotten.map(([m, n]) => `${MAT[m].name.toLowerCase()} — ${q(m, n)}`).join('; ')}.</div>
      )}
      {d.urgent && <div className="urgent-tag">Срочная: бригада стоит</div>}
      <span className="time">{time}</span>
    </div>
  )
}

function ApprovalCard({ s, lineId, time }: { s: State; lineId: string; time: string }) {
  const l = s.lines.find(x => x.id === lineId)
  if (!l) return null
  const pct = l.normAt > 0 ? Math.round((l.over / l.normAt) * 100) : null
  const decided = l.approval !== 'pending' && l.approval !== 'retro'
  return (
    <div className="card">
      <div className="card-title">Перерасход: {MAT[l.mat].name}</div>
      <div className="card-sub">{OBJ[l.objectId].name}, этап {l.stage} «{stageTpl(l.stage).name}», заявка №{l.reqNo}</div>
      <dl className="kv">
        <dt>Сверх нормы</dt><dd className="z-red">+{q(l.mat, l.over)} ≈ {rub(l.overRub)}{pct !== null ? `, +${pct}% к норме` : ', позиции нет в норме'}</dd>
        <dt>Норма этапа</dt><dd>{q(l.mat, l.normAt)}</dd>
        <dt>Причина</dt><dd>{REASON[l.reason ?? ''] ?? '—'}{l.comment ? `: «${l.comment}»` : ''}</dd>
        <dt>Бригадир</dt><dd>{OBJ[l.objectId].foreman}</dd>
      </dl>
      {decided && (
        <span className={`status-pill ${l.approval === 'rejected' ? 'red' : 'green'}`}>
          {l.approval === 'approved' && 'Согласовано'}
          {l.approval === 'rejected' && 'Отклонено'}
          {l.approval === 'reduced' && `Согласовано частично: +${q(l.mat, l.approvedOver ?? 0)}`}
        </span>
      )}
      <span className="time">{time}</span>
    </div>
  )
}

function ShipmentCard({ s, id, time }: { s: State; id: string; time: string }) {
  const sh = s.shipments.find(x => x.id === id)
  if (!sh) return null
  return (
    <div className="card">
      <div className="card-title">{sh.transferFrom ? `Перемещение с ${OBJ[sh.transferFrom].name}` : `Едет на ${OBJ[sh.objectId].name}`}</div>
      <div className="card-sub">{sh.orderNo ? `Заказ №${sh.orderNo}, ` : ''}примите материал и сфотографируйте накладную</div>
      {sh.lines.map(sl => (
        <div className="list-row" key={sl.mat}><span className="dot muted" />{MAT[sl.mat].name} — {q(sl.mat, sl.qty)}</div>
      ))}
      {sh.status !== 'expected' && (
        <span className={`status-pill ${sh.status === 'accepted' ? 'green' : 'yellow'}`}>{sh.status === 'accepted' ? 'Принято, фото есть' : 'Принято с расхождением, фото есть'}</span>
      )}
      <span className="time">{time}</span>
    </div>
  )
}
