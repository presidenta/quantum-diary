/* РИСУНКИ ПРАКТИК МОМЕНТОВ: МУДРА УТРОМ, ВЫДОХ С ОПУЩЕННЫМИ ПЛЕЧАМИ ВЕЧЕРОМ (выкладка 163).

   Владелец 19.10.2026: «утром мы складываем пальцы в мудру — прорисуй, найди мудру: человек должен
   видеть на рисунке, как сложить пальцы; вечером — фигурка человека, который выдыхает и опускает
   плечи». Здесь только сами рисунки, как строки SVG: ни DOM, ни хранилища, поэтому модуль
   проверяется в тестах и не тянет за собой экран.

   Рисуются в два слоя, чтобы получить один золотой контур вокруг цельного силуэта: сначала все
   фигуры толстой золотой линией (слой «контур»), поверх те же фигуры чуть уже и тёмного цвета
   (слой «заливка»). Там, где пальцы соприкасаются, контур остаётся между ними тонкой линией.
   Цвета и движение — в CSS (web/css/app.css, .q-fig*): атрибут style на странице запрещён
   политикой безопасности, а классы работают.

   МУДРА — «мудра знания» (Гьяна, Чин): кончики большого и указательного пальцев соединены в
   кольцо, остальные три пальца вытянуты и расслаблены. Самая известная утренняя мудра, и её
   легко узнать по рисунку. Рука — ладонью к зрителю, пальцами вверх. */

/* Пальцы: линия от основания к кончику; толщину им задаёт слой. */
const МИЗИНЕЦ = 'M166,176 L172,112';
const БЕЗЫМЯННЫЙ = 'M140,172 L143,66';
const СРЕДНИЙ = 'M113,170 L112,44';
/* Указательный и большой тянутся навстречу друг другу и встречаются в точке (46,126) — кольцо. */
const УКАЗАТЕЛЬНЫЙ = 'M86,176 L85,140 C84,114 64,106 52,118';
const БОЛЬШОЙ = 'M76,210 C44,208 30,186 36,162 C40,146 46,132 52,118';
/* Ладонь с запястьем; низ уходит за край рисунка, чтобы не было обрезанной линии. */
const ЛАДОНЬ = 'M70,170 L176,170 C178,215 166,238 152,252 L154,320 L96,320 L98,252 C80,238 68,212 70,170 Z';
const ТОЧКА_КАСАНИЯ = { x: 52, y: 118 };
/* Три складки на ладони: рисунок читается как рука, а не как перчатка. */
const СКЛАДКИ = 'M96,206 C108,224 132,228 152,212 M100,228 C112,240 128,242 140,236 M120,180 C122,196 126,204 134,208';

const ПАЛЬЦЫ = [МИЗИНЕЦ, БЕЗЫМЯННЫЙ, СРЕДНИЙ, УКАЗАТЕЛЬНЫЙ, БОЛЬШОЙ];

/** Мудра знания: SVG-строка. */
export function mudraSvg() {
    const контур = ПАЛЬЦЫ.map(d => `<path class="q-fig-line" d="${d}" stroke-width="25" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    const заливка = ПАЛЬЦЫ.map(d => `<path class="q-fig-dark" d="${d}" stroke-width="19" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    return `<svg class="q-fig q-fig-mudra" viewBox="0 0 240 300" role="img" aria-label="мудра знания" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="qfGlow"><stop offset="0" stop-color="#FAEBB8" stop-opacity=".9"/><stop offset="1" stop-color="#E3C77C" stop-opacity="0"/></radialGradient></defs>
<circle class="q-fig-halo" cx="120" cy="150" r="130" fill="url(#qfGlow)" opacity=".16"/>
<path class="q-fig-line" d="${ЛАДОНЬ}" stroke-width="5" stroke-linejoin="round"/>
${контур}
<path class="q-fig-dark q-fig-dark-fill" d="${ЛАДОНЬ}" stroke-width="1" stroke-linejoin="round"/>
${заливка}
<path class="q-fig-crease" d="${СКЛАДКИ}" fill="none" stroke-width="1.8" stroke-linecap="round"/>
<circle class="q-fig-spark" cx="${ТОЧКА_КАСАНИЯ.x}" cy="${ТОЧКА_КАСАНИЯ.y}" r="9" fill="url(#qfGlow)"/>
<circle class="q-fig-dot" cx="${ТОЧКА_КАСАНИЯ.x}" cy="${ТОЧКА_КАСАНИЯ.y}" r="3.2"/>
</svg>`;
}

/* ФИГУРКА С ОПУЩЕННЫМИ ПЛЕЧАМИ. Голова, шея и закрытые глаза неподвижны; плечи с руками — отдельная
   группа, которую CSS поднимает на вдохе и опускает на выдохе (шея при этом то прячется, то
   показывается). Дуги у рта — выдох: появляются, пока плечи опускаются. */
const ТУЛОВИЩЕ = 'M120,122 C86,122 56,132 46,162 L40,282 L70,286 L76,204 L78,360 L162,360 L164,204 L170,286 L200,282 L194,162 C184,132 154,122 120,122 Z';

/** Человек, который выдыхает и опускает плечи: SVG-строка (движение задаёт CSS). */
export function shouldersSvg() {
    return `<svg class="q-fig q-fig-shoulders" viewBox="0 0 240 300" role="img" aria-label="выдох, плечи опущены" xmlns="http://www.w3.org/2000/svg">
<defs><radialGradient id="qfGlowB"><stop offset="0" stop-color="#FAEBB8" stop-opacity=".9"/><stop offset="1" stop-color="#E3C77C" stop-opacity="0"/></radialGradient></defs>
<circle class="q-fig-halo" cx="120" cy="150" r="130" fill="url(#qfGlowB)" opacity=".12"/>
<path class="q-fig-line q-fig-neck" d="M106,96 L106,150 M134,96 L134,150" stroke-width="3" fill="none" stroke-linecap="round"/>
<g class="q-fig-body"><path class="q-fig-line q-fig-dark-fill" d="${ТУЛОВИЩЕ}" stroke-width="3" stroke-linejoin="round"/></g>
<circle class="q-fig-line q-fig-dark-fill" cx="120" cy="64" r="32" stroke-width="3"/>
<path class="q-fig-line" d="M102,62 q7,5 14,0 M124,62 q7,5 14,0" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<path class="q-fig-line" d="M112,84 q8,5 16,0" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<g class="q-fig-breath" fill="none" stroke-linecap="round" stroke-width="2.4">
<path class="q-fig-line q-fig-breath-1" d="M120,92 q0,14 -14,24"/>
<path class="q-fig-line q-fig-breath-2" d="M120,92 q0,18 0,30"/>
<path class="q-fig-line q-fig-breath-3" d="M120,92 q0,14 14,24"/>
</g>
</svg>`;
}
