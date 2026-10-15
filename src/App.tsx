import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { initState, reducer, type Action } from './bot'
import type { ChatId, Msg, State } from './model'
import { Panel, type Tab } from './Panel'
import { MessageView, Phone, type Chip } from './Phone'
import { currentHl, GuideCard, MobileGuide, SAMPLE_LEFTOVERS, SAMPLE_REQUEST, Stepper, STEPS as TOUR } from './Guide'

const STORE_KEY = 'snabagent-demo-v1'

function load(): State {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as State
      if (s.v === 1 && s.chats) return { ...s, typing: { foreman: false, director: false } }
    }
  } catch { /* хранилище недоступно — начинаем с чистого состояния */ }
  return initState()
}

function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#1D4C8F" />
      <rect x="5" y="12" width="22" height="8" rx="1.5" fill="#D29A4E" />
      <path d="M9 12v4M13 12v3M17 12v4M21 12v3M25 12v4" stroke="#22292F" strokeWidth="1.4" />
    </svg>
  )
}

export default function App() {
  return (
    <>
      <header className="top">
        <div className="wrap">
          <a className="brand" href="#top"><Logo />СнабАгент</a>
          <nav aria-label="Разделы">
            <a href="#chain">Как устроено</a>
            <a href="#demo">Демо</a>
            <a href="#why">Почему удобнее</a>
            <a href="#pilot">Запуск</a>
          </nav>
          <a className="btn primary small" href="#demo">Открыть демо</a>
        </div>
      </header>
      <main id="top">
        <Hero />
        <Chain />
        <Demo />
        <Why />
        <Pilot />
      </main>
      <footer>
        <div className="wrap">
          <span>СнабАгент — прототип для обсуждения. Компания, люди, объекты и цены вымышленные.</span>
          <span>Октябрь 2026</span>
        </div>
      </footer>
    </>
  )
}

function Hero() {
  const hero = useMemo(() => {
    let st = initState()
    st = reducer(st, { type: 'say', chat: 'foreman', text: SAMPLE_REQUEST })
    st = reducer(st, { type: 'text', chat: 'foreman', text: SAMPLE_REQUEST })
    return st
  }, [])
  const msgs = hero.chats.foreman.slice(1)
  return (
    <section className="hero">
      <div className="wrap">
        <div>
          <h1>Бригадир пишет заявку как привык. Система сверяет её с нормой дома</h1>
          <p className="lead">
            СнабАгент связывает бригадира, снабженца и руководителя в одном контуре: заявка в Max, сверка с нормой этапа,
            согласование перерасхода, закупка, приёмка с фото и фактический расход по каждому дому.
          </p>
          <div className="hero-actions">
            <a className="btn primary" href="#demo">Попробовать демо</a>
            <a className="btn" href="#chain">Как это устроено</a>
          </div>
          <p className="fine">Прототип для обсуждения: данные вымышленные, разбор заявок упрощён. В рабочей системе текст и голосовые разбирает языковая модель, а неуверенные строки бот уточняет кнопками.</p>
        </div>
        <div className="hero-phone">
          <div className="phone" aria-label="Пример: заявка бригадира и ответ бота">
            <div className="phone-head">
              <div className="ava" aria-hidden>СА</div>
              <div><b>СнабАгент</b><small>бот в Max, вы — бригадир</small></div>
            </div>
            <div className="msgs">
              <MessageView m={msgs[0]} s={hero} />
              <div className="typing scripted" aria-hidden><span /><span /><span /></div>
              {msgs.slice(1).map((m: Msg) => <MessageView key={m.id} m={m} s={hero} />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  ['Норма', 'Перечень материалов по этапам типового проекта, копия на каждый дом'],
  ['Заявка', 'Бригадир пишет в Max своими словами или берёт типовую заявку этапа'],
  ['Сверка', 'Каждая строка сравнивается с остатком нормы, видно забытое'],
  ['Согласование', 'Крупный перерасход уходит руководителю с причиной'],
  ['Закупка', 'Снабженец видит потребность всех объектов и заказывает оптом'],
  ['Приёмка', 'Бригадир подтверждает привоз в чате, фото накладной обязательно'],
  ['Остатки', 'Что лежит на каждом объекте; лишнее перевозят вместо покупки'],
  ['Расход', 'При закрытии этапа фактический остаток сравнивается с нормой'],
  ['Затраты', 'Материальные затраты и перерасход по дому в рублях'],
]

function Chain() {
  return (
    <section className="chain" id="chain">
      <div className="wrap">
        <h2>Один контур от нормы до затрат по дому</h2>
        <p className="sub">
          Сейчас эти шаги живут в разных местах: чат, Excel снабженца, учётная система. Здесь каждый шаг опирается на предыдущий,
          поэтому любую цифру в карточке дома можно раскрыть до заявки, заказа и фото накладной.
        </p>
        <div className="tape" role="list">
          {STEPS.map(([t, d], i) => (
            <div className="tape-step" role="listitem" key={t}><i>{i + 1}</i><b>{t}</b><span>{d}</span></div>
          ))}
        </div>
        <div className="tape-who">
          <span><em>Бригадир</em> работает только в Max</span>
          <span><em>Руководитель</em> согласует в Max, смотрит дома в панели</span>
          <span><em>Снабженец</em> работает в панели, Excel — только для выгрузки</span>
        </div>
      </div>
    </section>
  )
}

const GUIDE_KEY = 'snabagent-guide-v1'

function loadGuide(): { mode: 'guided' | 'free'; step: number } {
  try {
    const raw = localStorage.getItem(GUIDE_KEY)
    if (raw) {
      const g = JSON.parse(raw)
      if ((g.mode === 'guided' || g.mode === 'free') && Number.isInteger(g.step)) return { mode: g.mode, step: Math.min(Math.max(g.step, 0), TOUR.length - 1) }
    }
  } catch { /* без сохранения */ }
  return { mode: 'guided', step: 0 }
}

function useMobile() {
  const q = '(max-width: 760px)'
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

function Demo() {
  const mobile = useMobile()
  const [s, dispatch] = useReducer(reducer, undefined, load)
  const [guide, setGuide] = useState(loadGuide)
  const [chat, setChat] = useState<ChatId>('foreman')
  const [tab, setTab] = useState<Tab>('house')
  const [houseId, setHouseId] = useState('les12')
  const [text, setText] = useState('')
  const [opened5, setOpened5] = useState(false)
  const timers = useRef<number[]>([])
  const screenRef = useRef<HTMLDivElement>(null)

  const guided = guide.mode === 'guided'
  const step = guide.step
  const tour = TOUR[step]
  const ctx = { s, text, opened5 }
  const hl = guided ? currentHl(step, ctx) : {}
  const taskIdx = guided ? tour.tasks(ctx).findIndex(t => !t.done) : -1

  useEffect(() => { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)) } catch { /* без сохранения */ } }, [s])
  useEffect(() => { try { localStorage.setItem(GUIDE_KEY, JSON.stringify(guide)) } catch { /* без сохранения */ } }, [guide])
  useEffect(() => { if (s.unread[chat] > 0) dispatch({ type: 'seen', chat }) }, [s.unread, chat])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // В пошаговом режиме экран переключает сценарий
  useEffect(() => {
    if (!guided) return
    if (tour.screen.kind === 'phone') setChat(tour.screen.chat)
    else { setTab(tour.screen.tab); if (tour.screen.tab === 'house') setHouseId('les12') }
  }, [guided, step, tour])

  // Подсвеченная кнопка в панели может быть ниже края экрана — прокручиваем к ней
  useEffect(() => {
    if (!guided || !hl.panel) return
    const t = window.setTimeout(() => screenRef.current?.querySelector('.panel .hl')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)
    return () => clearTimeout(t)
  }, [guided, step, taskIdx, hl.panel])

  const later = (a: Action, ms: number) => { timers.current.push(window.setTimeout(() => dispatch(a), ms)) }
  const send = (c: ChatId, t: string) => { dispatch({ type: 'say', chat: c, text: t }); later({ type: 'text', chat: c, text: t }, 700) }
  const press = (c: ChatId, action: string, label: string, msgId?: string) => {
    dispatch({ type: 'press', chat: c, msgId, action, label })
    later({ type: 'act', chat: c, action }, 380)
  }
  const restart = () => {
    timers.current.forEach(clearTimeout)
    dispatch({ type: 'reset' })
    setGuide({ mode: 'guided', step: 0 })
    setChat('foreman'); setTab('house'); setText(''); setOpened5(false)
  }

  const closingInput = s.flow.kind === 'closing' && !s.flow.confirmShort
  const pendingShip = s.shipments.filter(x => x.status === 'expected' && (x.objectId === 'les12' || x.objectId === 'les14')).length
  const chips: Chip[] = chat === 'foreman'
    ? [
        closingInput
          ? { label: 'Вставить остатки', accent: true, onClick: () => setText(SAMPLE_LEFTOVERS) }
          : { label: 'Вставить пример заявки', accent: !s.reqs.some(r => r.demo), onClick: () => setText(SAMPLE_REQUEST) },
        { label: 'Типовая заявка', onClick: () => press('foreman', 'menu:template', 'Типовая заявка') },
        { label: 'Мои заявки', onClick: () => press('foreman', 'menu:mine', 'Мои заявки') },
        { label: pendingShip ? `Приёмка (${pendingShip})` : 'Приёмка', onClick: () => press('foreman', 'menu:accept', 'Приёмка') },
        { label: 'Закрыть этап', onClick: () => press('foreman', 'menu:close', 'Закрыть этап') },
      ]
    : [{ label: 'Сводка за день', accent: true, onClick: () => press('director', 'menu:summary', 'Сводка за день') }]

  const phone = (
    <Phone
      key={chat}
      s={s}
      chat={chat}
      typing={s.typing[chat]}
      onSend={t => send(chat, t)}
      onPress={(m, a, label) => press(chat, a, label, m.id)}
      onPhoto={chat === 'foreman' ? () => press('foreman', 'photo', 'Фото') : undefined}
      photoWanted={chat === 'foreman' && s.flow.kind === 'acceptPhoto'}
      chips={chips}
      draftText={chat === 'foreman' ? text : undefined}
      setDraftText={chat === 'foreman' ? setText : undefined}
      hl={hl}
    />
  )
  const panel = (
    <Panel s={s} dispatch={dispatch} tab={tab} setTab={setTab} houseId={houseId} setHouseId={setHouseId}
      hl={hl} only={guided} onOpenStage={st => { if (st === 5) setOpened5(true) }} />
  )
  const other: ChatId = chat === 'foreman' ? 'director' : 'foreman'

  return (
    <section className="demo" id="demo">
      <div className="wrap">
        <div className="demo-head">
          <div>
            <h2>Пройдите путь одной заявки</h2>
            <p>{guided
              ? 'Девять коротких шагов: от сообщения бригадира в Max до перерасхода в рублях по дому. На каждом шаге написано, кто вы и что сделать, нужная кнопка подсвечена, а после действия видно, что произошло в системе.'
              : 'Свободный режим: слева чаты бригадира и руководителя в Max, справа веб-панель. Действуйте в любом порядке.'}</p>
          </div>
          <div className="demo-ctl">
            <div className="seg" role="group" aria-label="Режим демо">
              <button aria-pressed={guided} onClick={() => setGuide({ ...guide, mode: 'guided' })}>Пошагово</button>
              <button aria-pressed={!guided} onClick={() => setGuide({ ...guide, mode: 'free' })}>Свободно</button>
            </div>
            <button className="btn small" onClick={restart}>Начать заново</button>
          </div>
        </div>

        {guided ? (
          <>
            <Stepper step={step} maxDone={step} />
            <div className="tour">
              <aside className="tour-guide">
                {mobile ? (
                  <MobileGuide
                    step={step}
                    ctx={ctx}
                    onNext={() => { setGuide({ ...guide, step: step + 1 }); document.querySelector('.stepper')?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }}
                    onRestart={restart}
                    onFree={() => setGuide({ ...guide, mode: 'free' })}
                    onGoto={i => setGuide({ ...guide, step: i })}
                  />
                ) : <GuideCard
                  step={step}
                  ctx={ctx}
                  onNext={() => { setGuide({ ...guide, step: step + 1 }); document.querySelector('.stepper')?.scrollIntoView({ block: 'start', behavior: 'smooth' }) }}
                  onRestart={restart}
                  onFree={() => setGuide({ ...guide, mode: 'free' })}
                  onGoto={i => setGuide({ ...guide, step: i })}
                />}
              </aside>
              <div className="tour-screen" ref={screenRef}>
                {tour.screen.kind === 'phone' ? <div className="phone-solo">{phone}</div> : panel}
              </div>
            </div>
          </>
        ) : (
          <div className="bench" ref={screenRef}>
            <div className="phone-col">
              <div className="role-row">
                <div className="seg" role="group" aria-label="Чей чат">
                  <button aria-pressed={chat === 'foreman'} onClick={() => setChat('foreman')}>
                    Бригадир{chat !== 'foreman' && s.unread.foreman > 0 && <span className="badge">{s.unread.foreman}</span>}
                  </button>
                  <button aria-pressed={chat === 'director'} onClick={() => setChat('director')}>
                    Руководитель{chat !== 'director' && s.unread.director > 0 && <span className="badge">{s.unread.director}</span>}
                  </button>
                </div>
                {s.unread[other] > 0 && <span className="hint">новое в другом чате</span>}
              </div>
              {phone}
            </div>
            {panel}
          </div>
        )}
      </div>
    </section>
  )
}

const ROWS: [string, string, string][] = [
  ['Заявка с объекта', 'Приложение: найти работу в смете, выбрать ресурс, ввести объём', 'Сообщение в Max своими словами или типовая заявка этапа одной кнопкой'],
  ['Проверка', 'Флаг «сверх бюджета», который видит снабженец', 'Бригадир видит остаток нормы и забытые позиции до отправки'],
  ['Перерасход', 'Без причины и без маршрута согласования', 'Причина по каждой строке, решение руководителя кнопкой, срочная заявка без простоя'],
  ['Закупка', 'Заявки обрабатываются по одной', 'Сводная потребность всех объектов и заказ поставщику в два клика'],
  ['Приёмка', 'Отдельная складская операция в программе', 'Карточка в чате: «Принято всё» или расхождение, фото накладной обязательно'],
  ['Фактический расход', 'Списание вручную, если его вообще ведут', 'Фактический остаток при закрытии этапа сравнивается с нормой'],
  ['Картина по дому', 'Разные отчёты в разных местах', 'Карточка дома: норма, заказано, принято, израсходовано, перерасход по причинам'],
]

function Why() {
  return (
    <section className="section" id="why">
      <div className="wrap">
        <h2>Почему не просто учётная система</h2>
        <p className="sub">
          Gectaro и похожие сервисы хорошо ведут сметы и склад — при запуске мы забираем оттуда сметы типовых проектов.
          Разница в том, как работают люди на объекте и как шаги связаны между собой.
        </p>
        <table className="compare">
          <thead><tr><th>Процесс</th><th>Обычно в учётной системе</th><th>В СнабАгенте</th></tr></thead>
          <tbody>{ROWS.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  )
}

function Pilot() {
  return (
    <section className="section" id="pilot" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <h2>Как запускаем</h2>
        <p className="sub">Шесть недель до полного контура. Пилот начинается после третьей недели на одном типовом проекте и одной-двух бригадах.</p>
        <div className="plan">
          <div>
            <span className="when">Неделя 0</span>
            <h3>Подготовка</h3>
            <ul>
              <li>Регистрация бота в Max на компанию</li>
              <li>20–30 реальных заявок бригадиров и Excel снабженца</li>
              <li>Нормы одного типового проекта в любом виде</li>
              <li>Импорт смет из Gectaro, если они там есть</li>
            </ul>
          </div>
          <div>
            <span className="when">Недели 1–3</span>
            <h3>Заявки и закупка</h3>
            <ul>
              <li>Справочник материалов с синонимами и нормы</li>
              <li>Заявка в Max, сверка с нормой, согласование</li>
              <li>Сводная потребность, заказы, выгрузка в Excel</li>
              <li>Старт пилота</li>
            </ul>
          </div>
          <div>
            <span className="when">Недели 4–6</span>
            <h3>Факт и деньги</h3>
            <ul>
              <li>Приёмка с фото, остатки, перемещения</li>
              <li>Закрытие этапа с фактическим остатком</li>
              <li>Карточка дома и материальные затраты</li>
              <li>Метрики пилота: доля заявок через бота, перерасход, сроки</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
