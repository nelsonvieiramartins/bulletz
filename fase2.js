// Traçado da Fase 2 · Av. T-9, Goiânia (abre com index.html?fase=2).
// Mesmo formato dos dados da Fase 1 em game.js; o comprimento e a arena do chefe também são os mesmos
// (chefe em x=6680, meta em 6870), então só mudam plataformas, inimigos e itens.
//
// Sem buracos e sem plataformas no ar: a rua é um chão contínuo e invisível em groundY, e a altura vem
// dos carros estacionados (o teto de cada um é plataforma) e da Carreta Furação.
// Plataformas: [x, y, largura, true]; o 4º valor marca plataforma invisível (sem bloco desenhado).
// Os carros ficam estacionados junto à calçada, na faixa de trás, e têm a altura do Edu; os tetos ficam
// ~68 acima dos pés dele, então a Fase 2 usa um pulo mais forte (jumpSpeed em game.js, o normal sobe ~62).
// Os carros (assets/fase2/carros) são recortados e medidos por tools/montar_carros.py.

const groundY = 232                 // altura dos pés do Edu: acima da faixa central do asfalto, que fica em ~241 (a tela tem 270)
const wheelY = groundY - 8          // onde as rodas dos carros pisam: junto à calçada, na faixa de trás da rua
const carData = await (await fetch('assets/fase2/carros.json')).json()

const P = (x,min,max,y=groundY) => ({ x, type: 'patrol', min, max, y })
const E = (x,min,max,y=groundY) => ({ x, type: 'elite', min, max, y })
const D = (x,y=161) => ({ x, type: 'drone', y })
const H = (x,y=161) => ({ x, type: 'heavyDrone', y })

// Carreta Furação parada na pista: canto esquerdo em truckX, rodas no chão.
// A arte tem 670 x 180 unidades; os andares abaixo foram medidos nela (x relativo à carreta).
const truckX = 2700
const truckShift = groundY - 224
const truck = (x, y, w) => [truckX + x, y + truckShift, w, true]
const truckLevel = { low: 180 + truckShift, upper: 101 + truckShift, roof: 51 + truckShift }

// Carro estacionado: n = número do carro (1 a 12, na ordem da imagem), x = canto esquerdo, flip = virado para a esquerda.
// Devolve as superfícies como plataformas (teto, capô, porta-malas, caçamba), o teto (x0..x1, y) e o sprite.
const cars = []
let lastCarEnd = -1e9
function car(n, x, flip = false) {
  const c = carData[n - 1]
  x = Math.max(x, lastCarEnd + 28)    // carros não se sobrepõem: empurra para a direita se faltar espaço
  lastCarEnd = x + c.w
  // todas as superfícies do carro (teto, capô, porta-malas, caçamba), espelhadas se o carro estiver virado
  const surfaces = c.surfaces.map(s => ({ x0: x + (flip ? c.w - s.x1 : s.x0), x1: x + (flip ? c.w - s.x0 : s.x1), y: wheelY - s.y }))
  const roof = surfaces.reduce((a, b) => (b.y < a.y ? b : a))   // a mais alta: onde ficam soldados e itens
  const parked = { x0: roof.x0, x1: roof.x1, y: roof.y,
    platforms: surfaces.map(s => [s.x0, s.y, s.x1 - s.x0, true]),
    prop: { sheet: 'car' + String(n).padStart(2,'0'), file: c.file, x, y: wheelY + 3, factor: 1, flip } }
  cars.push(parked)
  return parked
}
// soldado patrulhando o teto de um carro
const onCar = (c, kind = P) => kind(Math.round((c.x0 + c.x1) / 2), c.x0 + 6, c.x1 - 6, c.y)

// Setor 1 · Av. T-9: carros estacionados em escada baixa pelas calçadas
const c1 = car(1, 170), c2 = car(2, 420, true)
const c3 = car(8, 780), c4 = car(4, 960, true)
const c5 = car(5, 1360), c6 = car(6, 1560, true)
const c7 = car(9, 1950), c8 = car(10, 2150, true)
// Setor 2 · depois da carreta (a carreta ocupa 2700 a 3370)
const c9 = car(3, 3520), c10 = car(11, 3900, true)
const c11 = car(12, 4260), c12 = car(7, 4440, true)
// Setor 3 · Setor Bueno
const c13 = car(2, 4740), c14 = car(6, 4920)
const c15 = car(1, 5110, true), c16 = car(4, 5290)
const c17 = car(8, 5500, true), c18 = car(5, 5800, true), c19 = car(9, 5960)

const platforms = [
  [0,groundY,7000,true],      // a rua inteira, sem quedas
  // Carreta Furação: suba pelo andar de baixo, pelos armários amarelos e chegue ao teto
  truck(15,180,530),    // andar de baixo
  truck(428,145,118),   // armários amarelos
  truck(10,101,535),    // andar de cima
  truck(8,51,545),      // teto
  truck(555,116,90),    // teto da cabine
  ...cars.flatMap(c => c.platforms)
]
// medalhas de vida extra: teto de um carro do Setor 1, teto da carreta e carro do Setor 3
const pickupSpots = [[(c4.x0+c4.x1)/2, c4.y-18], [2990, truckLevel.roof-18], [(c14.x0+c14.x1)/2, c14.y-18]]
const powerUpSpots = [[(c8.x0+c8.x1)/2, c8.y]]
const enemySpawns = [
  // Setor 1
  P(300,200,620), onCar(c2), D(560),
  P(760,700,1240), onCar(c3), D(900), P(1100,700,1240),
  D(1300), P(1450,1300,1800), onCar(c5), onCar(c6), D(1700),
  P(1950,1860,2350), onCar(c8), D(2100),
  // Setor 2 · soldados nos andares da carreta e drones por cima
  P(2500,2410,2690), D(2600),
  P(2900,2720,3240,truckLevel.low), P(3060,2720,3240,truckLevel.upper), D(3150,150),
  E(3420,3380,3890), onCar(c9), E(3750,3380,3890), D(3800),
  H(4050,150),
  P(4300,4190,4590), onCar(c11), onCar(c12), D(4450,140),
  // Setor 3
  E(4800,4670,5030), onCar(c13), H(4900),
  H(5200,128),
  E(5600,5410,5770), onCar(c17), E(5700,5410,5770), H(5650),
  H(5930,140),
  E(6200,6090,6420), H(6260), P(6350,6100,6440)
]

export const fase2 = {
  title: 'AV. T-9 · GOIÂNIA',
  // Músicas MIDI que o menu deixa escolher (a primeira é a padrão); tocadas por midiplayer.js
  musicas: [
    // mix: bass/kick multiplicam o volume do baixo e do bumbo; lowCut (Hz) corta o grave das guitarras;
    // drive é a distorção da guitarra distorcida (5 = padrão); guitar é o estilo: 'distorcida', 'limpa' ou 'acustica'; reverb é a reverberação das guitarras (0 a ~.4)
    { id: 'animals', nome: 'Animals — Nickelback', arquivo: 'assets/musica-fase2-animals/nickelback-animals.mid', mix: { bass: .3, kick: .4, lowCut: 170, drive: .4, reverb: .1 } },
    { id: 'whatif', nome: 'What If — Creed', arquivo: 'assets/musica-fase2/creed-what-if-2.mid' }
  ],
  victory: 'AV. T-9 LIBERTADA',
  groundY,
  zones: [
    [2330, 'SETOR 2 · CARRETA FURAÇÃO'],
    [4620, 'SETOR 3 · SETOR BUENO']
  ],
  platforms,
  movers: [],
  checkpoints: [1300, 3480, 5450],
  pickupSpots,
  powerUpSpots,
  enemySpawns,
  // Sprites de carros usados (para o jogo carregar)
  carSheets: [...new Map(cars.map(c => [c.prop.sheet, c.prop.file])).entries()],
  // Artes na altura da pista: x no mundo, base em y, factor 1 = anda junto com a pista
  props: [
    { sheet: 'truck', x: truckX, y: groundY+4, factor: 1 },
    ...cars.map(c => c.prop)
  ]
}
