// UI strings. Bulgarian is the default language; English optional.
export const STRINGS = {
  bg: {
    title: 'Градски транспорт София', subtitle: 'Линия 280 · СУ „Св. Климент Охридски“ – Студентски град',
    driver: 'Шофьор', passenger: 'Пътник', settings: 'Настройки', cont: 'Продължи', credits: 'Автори', back: 'Назад',
    start: 'Тръгвай', bus: 'Автобус', terminal: 'Начална спирка', direction: 'Посока', weather: 'Време', time: 'Час',
    graphics: 'Графика', traffic: 'Трафик', clear: 'Ясно', cloudy: 'Облачно', rain: 'Слаб дъжд',
    morning: 'Сутрин', noon: 'Обед', evening: 'Вечер', night: 'Нощ', low: 'Слаб', medium: 'Среден', high: 'Натоварен',
    nextStop: 'Следваща спирка', stop: 'Спирка', doors: 'Врати', speed: 'км/ч', schedule: 'График', onTime: 'навреме',
    paused: 'Пауза', resume: 'Продължи', mainMenu: 'Главно меню', restart: 'Рестарт', camera: 'Камера',
    startStop: 'Спирка на тръгване', boardHint: 'Изчакайте автобус 280. Качете се, когато вратите се отворят.',
    language: 'Език', volume: 'Сила на звука', master: 'Общо', engine: 'Двигател', voice: 'Съобщения', ambience: 'Град',
    sfx: 'Ефекти', sensitivity: 'Чувствителност', gyro: 'Жироскопно управление', invertY: 'Обърната ос Y',
    showFps: 'Покажи FPS', renderScale: 'Резолюция', voiceSel: 'Глас за съобщенията', beep: 'Звук на вратите',
    controlsSize: 'Размер на бутоните', checklist: 'Подготовка', loading: 'Зареждане…', tripDone: 'Курсът е завършен',
    score: 'Оценка', touchHint: 'Докоснете, за да започнете',
  },
  en: {
    title: 'Sofia Public Transport', subtitle: 'Line 280 · Sofia University – Studentski Grad',
    driver: 'Driver', passenger: 'Passenger', settings: 'Settings', cont: 'Continue', credits: 'Credits', back: 'Back',
    start: 'Start', bus: 'Bus', terminal: 'Starting terminal', direction: 'Direction', weather: 'Weather', time: 'Time',
    graphics: 'Graphics', traffic: 'Traffic', clear: 'Clear', cloudy: 'Cloudy', rain: 'Light rain',
    morning: 'Morning', noon: 'Noon', evening: 'Evening', night: 'Night', low: 'Light', medium: 'Medium', high: 'Heavy',
    nextStop: 'Next stop', stop: 'Stop', doors: 'Doors', speed: 'km/h', schedule: 'Schedule', onTime: 'on time',
    paused: 'Paused', resume: 'Resume', mainMenu: 'Main menu', restart: 'Restart', camera: 'Camera',
    startStop: 'Starting stop', boardHint: 'Wait for bus 280. Board when the doors open.',
    language: 'Language', volume: 'Volume', master: 'Master', engine: 'Engine', voice: 'Announcements', ambience: 'City',
    sfx: 'Effects', sensitivity: 'Sensitivity', gyro: 'Gyro steering', invertY: 'Invert Y axis',
    showFps: 'Show FPS', renderScale: 'Render scale', voiceSel: 'Announcement voice', beep: 'Door warning sound',
    controlsSize: 'Button size', checklist: 'Preparation', loading: 'Loading…', tripDone: 'Trip complete',
    score: 'Score', touchHint: 'Tap to start',
  },
};

let lang = 'bg';
export function setLang(l) {
  lang = STRINGS[l] ? l : 'bg';
}
export function getLang() {
  return lang;
}
export function t(key) {
  return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.bg[key] || key;
}
