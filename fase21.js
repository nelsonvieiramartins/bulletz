// Fase 2.1 · Em cima da Carreta Furação em movimento (Fofões e Chapolins, sem drones) (abre com index.html?fase=2.1).
// O Edu anda pela carreta inteira e a câmera o acompanha até a traseira, enquanto a rua e o céu passam rápido atrás.
// Os inimigos chegam em ondas, entrando por trás da carreta (soldados nos andares, drones pelos dois lados da tela).
// Mesmo formato dos dados de fase2.js, mais as ondas. Os andares são os mesmos medidos na carreta da Fase 2.

// rodas da carreta recortadas por tools/montar_rodas.py: o jogo gira cada uma sobre a arte parada
const wheelData = await (await fetch('assets/fase2/rodas.json')).json()

const roadY = 232                    // asfalto onde a carreta anda (o mesmo da Fase 2)
const drop = 14                      // quanto a carreta fica mais baixa que o asfalto da Fase 2 (as rodas afundam um pouco na pista)
const shift = roadY - 224 + drop
const truckX = 0                     // canto esquerdo (a traseira) da carreta no mundo; ela tem 670 de comprimento
const cameraMax = 670 - 480 + 60     // a câmera vai da traseira (0) até passar da frente da cabine, mostrando um pouco de rua à frente
const cameraLead = 200               // posição do Edu na tela quando a câmera está seguindo
const truck = (x, y, w) => [truckX + x, y + shift, w, true]   // andar medido na arte da carreta (x relativo a ela)

const level = { low: 180 + shift, cabinets: 145 + shift, upper: 101 + shift, roof: 51 + shift }
// pedaço invisível de piso atrás da traseira: os soldados entram por ele, vindos dos carros que perseguem a carreta
const rearPad = 175
const bounds = [22, 660]             // onde o Edu pode andar: do fundo da traseira até a frente da cabine

// Ondas: t = segundos depois do aviso da onda; level = andar (soldados) ou altura em y (drones); side = lado de entrada.
const S = (type, lvl, t = 0) => ({ type, level: lvl, side: 'left', t })
const D = (type, y, side, t = 0) => ({ type, level: y, side, t })
const waves = [
  { name: 'ONDA 1', spawns: [S('fofao','low',0), S('fofao','low',1.4), S('chapolim','low',2.8), S('fofao','upper',3.6)] },
  { name: 'ONDA 2', spawns: [S('fofao','low',0), S('chapolim','upper',.8), S('fofao','low',1.8), S('fofao','upper',2.6), S('chapolim','low',3.8), S('fofao','low',5)] },
  { name: 'ONDA 3', spawns: [S('chapolim','low',0), S('fofao','low',.8), S('fofao','upper',1.6), S('chapolim','roof',2.4), S('fofao','upper',3.4), S('fofao','roof',4.4), S('chapolim','low',5.5)] },
  { name: 'ONDA 4', spawns: [S('fofao','roof',0), S('chapolim','low',.6), S('fofao','upper',1.2), S('fofao','low',2), S('chapolim','upper',2.8), S('fofao','roof',3.6), S('chapolim','roof',4.6), S('fofao','low',5.5)] },
  { name: 'ONDA 5', spawns: [S('chapolim','upper',0), S('fofao','low',.6), S('chapolim','low',1.4), S('fofao','upper',2.2), S('fofao','roof',3), S('chapolim','roof',3.8), S('fofao','upper',4.6), S('fofao','low',5.4), S('chapolim','upper',6.2)] },
  { name: 'ONDA FINAL', spawns: [S('chapolim','low',0), S('fofao','upper',.7), S('fofao','roof',1.4), S('chapolim','low',2), S('fofao','upper',2.7), S('fofao','low',3.4), S('chapolim','roof',4.1), S('fofao','roof',4.8), S('fofao','upper',5.5), S('chapolim','upper',6.2), S('fofao','low',6.9), S('fofao','roof',7.6), S('chapolim','low',8.3)] }
]

export const fase21 = {
  title: 'EM CIMA DA CARRETA FURAÇÃO',
  eyebrow: 'PAUSA · FASE 2.1',
  victory: 'CARRETA FURAÇÃO SALVA',
  roadY,
  groundY: level.low,                // onde o Edu nasce e volta depois de cair: o andar de baixo
  startX: 390,                       // o Edu começa perto da cabine
  bounds,
  cameraMax,
  cameraLead,
  speed: 380,                        // unidades por segundo da rua (o céu anda a uma fração disso)
  level,
  waves,
  // sem plataformas no chão: tudo é a própria carreta
  platforms: [
    truck(15 - rearPad,180,657 + rearPad),    // andar de baixo, até a frente da cabine (e o piso invisível atrás da traseira)
    truck(428,145,118),                       // armários amarelos
    truck(10 - rearPad,101,535 + rearPad),    // andar de cima
    truck(8 - rearPad,51,545 + rearPad),      // teto do trailer
    truck(556,75,94)                          // cabine: teto, sob a placa "Carreta Furação" (sem plataforma no meio das portas: lá embaixo é o andar de baixo)
  ],
  movers: [],
  checkpoints: [],
  zones: [],
  pickupSpots: [],
  powerUpSpots: [],
  enemySpawns: [],                   // os inimigos vêm das ondas, não de pontos fixos
  carSheets: [],
  wheels: wheelData.rodas,
  wheelSpin: 24,                     // radianos por segundo; acima de ~19 os furos do aro podem parecer girar ao contrário
  // amortecimento: de tempos em tempos a carreta pega um buraco e balança sobre a mola (tudo menos o cenário)
  suspension: { stiffness: 190, damping: 7.5, bumpEvery: [1.8, 5.5], kick: [45, 95] },
  // a carreta fica parada no mundo (factor 1, anda com a câmera); a rua e o céu é que passam
  props: [{ sheet: 'truck', x: truckX, y: roadY + 4 + drop, factor: 1 }]
}
