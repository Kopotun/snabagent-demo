// Демо-данные: вымышленный застройщик, типовой проект «Д-120», три дома.
// Регулярные выражения пишем без \w и \b: в JS они не понимают кириллицу.

export type UnitCode = 'шт' | 'м³' | 'кг' | 'л' | 'лист' | 'рулон' | 'м²' | 'м' | 'уп' | 'мешок' | 'т' | 'канистра'

export interface Material {
  id: string
  name: string
  unit: UnitCode // базовая единица
  price: number // ₽ за базовую единицу
  aliases: RegExp[] // как это называют на объекте
  units?: Partial<Record<UnitCode, number>> // сколько базовых единиц в 1 такой единице
  key?: boolean // ключевой для инвентаризации при закрытии этапа
  category: string
}

// ~ — любые буквы после корня слова
const L = '[а-яё]*'
const re = (s: string) => new RegExp(s.replace(/~/g, L))
const word = (s: string) => new RegExp(`(^|[^а-яё])${s.replace(/~/g, L)}([^а-яё]|$)`)

export const MATERIALS: Material[] = [
  { id: 'brus150', name: 'Брус 150×150×6000', unit: 'шт', price: 2700, key: true, category: 'Пиломатериалы',
    aliases: [re('брус~\\s*150'), re('брус~\\s*сто\\s*пятьдесят')], units: { 'м³': 7.407 } },
  { id: 'brus50', name: 'Брусок 50×50×3000', unit: 'шт', price: 120, category: 'Пиломатериалы',
    aliases: [re('брус~\\s*50'), word('брус(ок|ки|ков|ка)')] },
  { id: 'doska50', name: 'Доска 50×150×6000', unit: 'м³', price: 19000, key: true, category: 'Пиломатериалы',
    aliases: [re('пятидесятк~'), re('доск~\\s*50'), re('доск~\\s*пятьдесят')], units: { 'шт': 0.045 } },
  { id: 'doska25', name: 'Доска 25×100×6000', unit: 'м³', price: 17500, category: 'Пиломатериалы',
    aliases: [re('доск~\\s*25'), re('двадцатипятк~'), re('обрешетк~'), re('опалубк~')], units: { 'шт': 0.015 } },
  { id: 'osb', name: 'Плита OSB-3 12 мм', unit: 'лист', price: 950, key: true, category: 'Плиты',
    aliases: [/(^|[^a-z])osb([^a-z]|$)/, word('осб'), word('осп(-?3)?')], units: { 'шт': 1 } },
  { id: 'ugolok', name: 'Уголок крепёжный 90×90', unit: 'шт', price: 35, category: 'Крепёж',
    aliases: [re('уголк~'), re('уголок')] },
  { id: 'gvozdi', name: 'Гвозди строительные 4×100', unit: 'кг', price: 180, category: 'Крепёж',
    aliases: [re('гвозд~'), re('сотк~')], units: { 'мешок': 25, 'уп': 5 } },
  { id: 'samorezKrov', name: 'Саморезы кровельные 4,8×35', unit: 'шт', price: 3, category: 'Крепёж',
    aliases: [re('кровельн~\\s*саморез~'), re('саморез~\\s*кровел~')], units: { 'уп': 250 } },
  { id: 'samorez70', name: 'Саморезы по дереву 4,5×70', unit: 'шт', price: 2.2, category: 'Крепёж',
    aliases: [re('саморез~')], units: { 'уп': 200 } },
  { id: 'antiseptik', name: 'Антисептик для древесины', unit: 'л', price: 150, category: 'Химия',
    aliases: [re('антисепт~'), re('пропитк~')], units: { 'канистра': 10 } },
  { id: 'pena750', name: 'Пена монтажная 750 мл', unit: 'шт', price: 520, category: 'Химия',
    aliases: [re('пен[аыуо]~\\s*750')] },
  { id: 'pena1000', name: 'Пена монтажная 1000 мл', unit: 'шт', price: 690, category: 'Химия',
    aliases: [re('пен[аыуо]~\\s*1000'), re('пен[аыуо]~\\s*литр')] },
  { id: 'veter', name: 'Мембрана ветрозащитная, рулон 75 м²', unit: 'рулон', price: 3200, category: 'Изоляция',
    aliases: [re('ветрозащ~'), re('ветро~')] },
  { id: 'gidro', name: 'Мембрана гидроизоляционная, рулон 75 м²', unit: 'рулон', price: 3600, category: 'Изоляция',
    aliases: [re('мембран~\\s*гидро'), re('гидромембран~'), re('гидроизоляционн~\\s*мембран~')] },
  { id: 'gidroNapl', name: 'Гидроизоляция наплавляемая', unit: 'рулон', price: 1900, category: 'Изоляция',
    aliases: [re('наплавл~'), re('рубероид~')] },
  { id: 'para', name: 'Пароизоляция, рулон 70 м²', unit: 'рулон', price: 2400, category: 'Изоляция',
    aliases: [re('пароизол~'), word('парик~')] },
  { id: 'uteplitel', name: 'Утеплитель минеральный 150 мм (уп.)', unit: 'уп', price: 1850, category: 'Изоляция',
    aliases: [re('утепл~'), re('минват~'), word('ват[аыу]')] },
  { id: 'metall', name: 'Металлочерепица 0,5 мм', unit: 'м²', price: 760, key: true, category: 'Кровля',
    aliases: [re('металлочереп~'), re('черепиц~')] },
  { id: 'konek', name: 'Конёк для металлочерепицы 2 м', unit: 'шт', price: 950, category: 'Кровля',
    aliases: [re('кон[её]к~'), re('коньк~')] },
  { id: 'beton', name: 'Бетон В22,5 (М300)', unit: 'м³', price: 7400, key: true, category: 'Бетон и металл',
    aliases: [re('бетон~'), re('миксер~')] },
  { id: 'armatura', name: 'Арматура А500С ⌀12', unit: 'кг', price: 68, category: 'Бетон и металл',
    aliases: [re('арматур~'), word('арм')], units: { 'т': 1000 } },
  { id: 'provoloka', name: 'Проволока вязальная', unit: 'кг', price: 160, category: 'Бетон и металл',
    aliases: [re('проволок~'), re('вязальн~')] },
  { id: 'svai', name: 'Сваи винтовые 108×2500', unit: 'шт', price: 3900, key: true, category: 'Бетон и металл',
    aliases: [word('сва[ийяе]~')] },
  { id: 'pesok', name: 'Песок строительный', unit: 'м³', price: 900, category: 'Сыпучие',
    aliases: [re('песк~'), re('песок')] },
  { id: 'sheben', name: 'Щебень фр. 20–40', unit: 'м³', price: 2300, category: 'Сыпучие',
    aliases: [re('щеб[её]н~'), re('щебн~')] },
  { id: 'geotekstil', name: 'Геотекстиль', unit: 'м²', price: 45, category: 'Сыпучие',
    aliases: [re('геотекст~')] },
  { id: 'okno', name: 'Окно ПВХ 1200×1400', unit: 'шт', price: 14500, category: 'Окна и двери',
    aliases: [word('окн[оа]~'), word('окон')] },
  { id: 'dver', name: 'Дверь входная металлическая', unit: 'шт', price: 32000, category: 'Окна и двери',
    aliases: [re('двер~')] },
  { id: 'imitacia', name: 'Имитация бруса 20×146', unit: 'м²', price: 820, category: 'Отделка',
    aliases: [re('имитаци~')] },
  { id: 'kabel', name: 'Кабель ВВГнг 3×2,5', unit: 'м', price: 85, category: 'Инженерия',
    aliases: [re('кабел~'), word('провод~')] },
  { id: 'truba', name: 'Труба PP-R 25 мм', unit: 'м', price: 70, category: 'Инженерия',
    aliases: [word('труб~'), re('полипропилен~')] },
  { id: 'gkl', name: 'ГКЛ 12,5 мм 2500×1200', unit: 'лист', price: 520, category: 'Отделка',
    aliases: [word('гкл'), re('гипрок~'), re('гипсокартон~')], units: { 'шт': 1 } },
  { id: 'shpaklevka', name: 'Шпаклёвка гипсовая 25 кг', unit: 'мешок', price: 560, category: 'Отделка',
    aliases: [re('шпакл[её]в~')], units: { 'шт': 1 } },
]

export const MAT: Record<string, Material> = Object.fromEntries(MATERIALS.map(m => [m.id, m]))

// Материалы, которые на объекте называют одним словом, а в справочнике их несколько
export const AMBIGUOUS: { re: RegExp; options: string[] }[] = [
  { re: word('(пен[аыуо]|пенк~)'), options: ['pena750', 'pena1000'] },
  { re: re('мембран~'), options: ['veter', 'gidro'] },
]

export interface StageTemplate { no: number; name: string; days: number; norm: [string, number][] }

export const PROJECT = {
  id: 'D120',
  name: 'Д-120',
  title: 'Каркасный дом 120 м², два этажа',
  normVersion: 3,
  stages: [
    { no: 1, name: 'Подготовка участка', days: 5, norm: [['pesok', 20], ['sheben', 12], ['geotekstil', 150], ['doska25', 0.6]] },
    { no: 2, name: 'Фундамент', days: 10, norm: [['svai', 36], ['beton', 6], ['armatura', 450], ['provoloka', 8], ['doska25', 1.2]] },
    { no: 3, name: 'Обвязка и гидроизоляция', days: 5, norm: [['gidroNapl', 6], ['brus150', 18], ['antiseptik', 20]] },
    { no: 4, name: 'Перекрытие пола', days: 7, norm: [['doska50', 3.2], ['osb', 40], ['ugolok', 80], ['gvozdi', 15], ['uteplitel', 40]] },
    { no: 5, name: 'Каркас стен', days: 14, norm: [['doska50', 6.5], ['brus150', 24], ['ugolok', 120], ['gvozdi', 30], ['samorez70', 1200], ['antiseptik', 40], ['pena750', 12], ['veter', 4]] },
    { no: 6, name: 'Мансарда', days: 10, norm: [['doska50', 3.5], ['osb', 36], ['ugolok', 60], ['gvozdi', 15]] },
    { no: 7, name: 'Стропильная система', days: 8, norm: [['doska50', 4.2], ['brus50', 60], ['ugolok', 90], ['gvozdi', 20], ['antiseptik', 30]] },
    { no: 8, name: 'Кровля', days: 10, norm: [['osb', 85], ['metall', 160], ['gidro', 3], ['konek', 8], ['samorezKrov', 2500], ['doska25', 1.5]] },
    { no: 9, name: 'Окна и двери', days: 5, norm: [['okno', 9], ['dver', 1], ['pena750', 24]] },
    { no: 10, name: 'Утепление', days: 8, norm: [['uteplitel', 120], ['para', 4], ['samorez70', 600]] },
    { no: 11, name: 'Фасад', days: 12, norm: [['imitacia', 190], ['antiseptik', 40], ['brus50', 80]] },
    { no: 12, name: 'Электрика', days: 6, norm: [['kabel', 450]] },
    { no: 13, name: 'Вода, отопление, канализация', days: 8, norm: [['truba', 180]] },
    { no: 14, name: 'Внутренняя отделка', days: 20, norm: [['gkl', 140], ['shpaklevka', 30]] },
  ] as StageTemplate[],
}

export interface HouseObject {
  id: string
  name: string
  aliases: RegExp[]
  crew: string
  foreman: string
  start: string // ISO
  activeStage: number // этапы до него закрыты
  customerChanges?: { stage: number; mat: string; delta: number; note: string }[]
  leftovers?: { stage: number; mat: string; qty: number }[] // фактический остаток при закрытии этапа
  activeReceived?: [string, number][] // уже принято по активному этапу
}

export const OBJECTS: HouseObject[] = [
  {
    id: 'les12', name: 'Лесная, 12', aliases: [re('лесн~\\s*,?\\s*(12|двенадцат~)')],
    crew: 'Бригада Котова', foreman: 'Сергей Котов', start: '2026-09-05', activeStage: 5,
    activeReceived: [['brus150', 10], ['doska50', 4], ['ugolok', 120], ['gvozdi', 10], ['antiseptik', 40]],
  },
  {
    id: 'les14', name: 'Лесная, 14', aliases: [re('лесн~\\s*,?\\s*(14|четырнадцат~)')],
    crew: 'Бригада Котова', foreman: 'Сергей Котов', start: '2026-08-10', activeStage: 8,
    leftovers: [{ stage: 5, mat: 'brus150', qty: 4 }, { stage: 7, mat: 'doska50', qty: 0.3 }],
    activeReceived: [['osb', 40], ['gidro', 3], ['doska25', 1.5]],
  },
  {
    id: 'sos3', name: 'Сосновая, 3', aliases: [re('соснов~\\s*,?\\s*(3|три|трет~)')],
    crew: 'Бригада Ахмедова', foreman: 'Рустам Ахмедов', start: '2026-10-03', activeStage: 2,
    customerChanges: [
      { stage: 4, mat: 'doska50', delta: 1.4, note: 'Терраса 24 м² по просьбе покупателя' },
      { stage: 11, mat: 'imitacia', delta: 36, note: 'Терраса 24 м² по просьбе покупателя' },
    ],
    activeReceived: [['svai', 36], ['armatura', 450]],
  },
]

export const OBJ: Record<string, HouseObject> = Object.fromEntries(OBJECTS.map(o => [o.id, o]))
export const FOREMAN_OBJECTS = ['les12', 'les14'] // объекты Сергея Котова — его чат в демо

export const SUPPLIERS = [
  { id: 'les', name: 'Лесобаза «Хехцир»', categories: ['Пиломатериалы', 'Плиты'] },
  { id: 'krep', name: 'Крепёж-ДВ', categories: ['Крепёж', 'Химия'] },
  { id: 'krov', name: 'Кровельный центр', categories: ['Кровля', 'Изоляция'] },
  { id: 'beton', name: 'БетонСтрой', categories: ['Бетон и металл', 'Сыпучие'] },
  { id: 'univ', name: 'Строймаркет «Амур»', categories: ['Отделка', 'Инженерия', 'Окна и двери', 'Химия', 'Крепёж'] },
]

export const REASONS = [
  { code: 'supplier_defect', name: 'Брак поставщика' },
  { code: 'site_damage', name: 'Порча на объекте' },
  { code: 'norm_error', name: 'Ошибка в норме' },
  { code: 'design_change', name: 'Изменение проекта' },
  { code: 'stock_ahead', name: 'Запас на след. этап' },
  { code: 'other', name: 'Другое' },
]
export const REASON: Record<string, string> = Object.fromEntries(REASONS.map(r => [r.code, r.name]))

export const SETTINGS = {
  yellowPct: 0.1, // перебор до 10% нормы
  yellowRub: 5000, // и до 5 000 ₽ — не ждёт согласования
  smallRub: 2000, // мелочь до 2 000 ₽ не ждёт согласования никогда
  consumptionTolerance: 0.05, // допуск расхода при закрытии этапа
}

export const TODAY = '2026-10-13'
