// ─────────────────────────────────────────────
//  PARÁMETROS VISUALES
// ─────────────────────────────────────────────
const IMG_BLANCO = "img/blanco1.png";
const IMG_AZUL   = "img/azul1.png";
const IMG_ROJO   = "img/rojo1.png";

const TAMANIO_MIN       = 35;
const TAMANIO_MAX       = 50;
const CANTIDAD_CIRCULOS = 270;
const MARCO             = 25;

const NIVELES_OPACIDAD  = [40, 100, 180, 255];

// ─────────────────────────────────────────────
//  PARÁMETROS DE AUDIO
// ─────────────────────────────────────────────

// Volumen mínimo para considerar que hay sonido (0.0 a 1.0)
const AMP_MIN            = 0.0;
const AMP_MAX            = 1.0;
const UMBRAL_VOLUMEN     = 0.05;   // sobre la señal filtrada (0.0 a 1.0)

// Frecuencia que divide grave de agudo (Hz)
const FREC_MIN           = 50;    // frecuencia mínima esperada
const FREC_MAX           = 1500;  // frecuencia máxima esperada
const UMBRAL_FRECUENCIA  = 175;   // por debajo = grave; por encima = agudo

// Duración mínima para considerar un sonido como "mantenido" (ms)
const UMBRAL_MANTENIDO   = 500;

// Tiempo mínimo entre dos detecciones del mismo tipo (ms)
const COOLDOWN           = 700;

// Factor de suavizado de la señal (0.0 = sin suavizado, 1.0 = nunca cambia)
const FACTOR_SUAVIZADO   = 0.80;

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/ml5js/ml5-data-and-models/models/pitch-detection/crepe/';

// ─────────────────────────────────────────────
//  ESTADO VISUAL
// ─────────────────────────────────────────────
let contadorGrave = 0;
let contadorAgudo = 0;
let nivelOpacidad = 0;
let dirOpacidad   = 1;

let circulos  = [];
let imgBlanco, imgAzul, imgRojo;

// ─────────────────────────────────────────────
//  ESTADO DE AUDIO
// ─────────────────────────────────────────────
let mic, pitch, audioContext;
let modeloCargado = false;

// Señales filtradas
let ampFiltrada  = 0;
let frecFiltrada = 0;
let ampAnterior  = 0;

// Seguimiento del sonido actual
let sonidoActivo             = false;
let antesHabiaSonido         = false;
let tiempoInicioSonido       = 0;
let volumenPicoSonido        = 0;
let frecAcumulada            = 0;
let muestrasFrilladas        = 0;
let sonidoMantenidoYaContado = false;

// Cooldowns
let ultimoGrave     = -COOLDOWN;
let ultimoAgudo     = -COOLDOWN;
let ultimoMantenido = -COOLDOWN;

// Modo calibración
let modoCalibrar  = false;
let frecActual    = 0;

// ─────────────────────────────────────────────
//  CARGA
// ─────────────────────────────────────────────
function preload() {
  imgBlanco = loadImage(IMG_BLANCO);
  imgAzul   = loadImage(IMG_AZUL);
  imgRojo   = loadImage(IMG_ROJO);
}

// ─────────────────────────────────────────────
//  SETUP
// ─────────────────────────────────────────────
function setup() {
  let cnv = createCanvas(350, 560);
  cnv.elt.setAttribute('tabindex', '0');
  cnv.elt.focus();
  cnv.mousePressed(() => cnv.elt.focus());
  imageMode(CENTER);

  audioContext = getAudioContext();
  mic = new p5.AudioIn();
  mic.start(iniciarPitch); 
  userStartAudio();

  generarCirculos();
}

// ─────────────────────────────────────────────
//  INICIAR PITCH
// ─────────────────────────────────────────────
function iniciarPitch() {
  pitch = ml5.pitchDetection(MODEL_URL, audioContext, mic.stream, modeloListo);
}

function modeloListo() {
  modeloCargado = true;
  obtenerPitch();
}

// Loop de detección de pitch — se llama a sí misma continuamente
function obtenerPitch() {
  pitch.getPitch(function(err, frecuencia) {
    if (frecuencia) {
      // Filtrar y mapear la frecuencia
      let frecMapeada = map(frecuencia, FREC_MIN, FREC_MAX, 0.0, 1.0);
      frecMapeada     = constrain(frecMapeada, 0.0, 1.0);
      frecFiltrada    = frecFiltrada * FACTOR_SUAVIZADO + frecMapeada * (1 - FACTOR_SUAVIZADO);
      frecActual      = frecuencia;
    }
    obtenerPitch(); // se vuelve a llamar para el próximo frame
  });
}

// ─────────────────────────────────────────────
//  GENERACIÓN DE CÍRCULOS
// ─────────────────────────────────────────────
function generarCirculos() {
  circulos = [];
  for (let i = 0; i < CANTIDAD_CIRCULOS; i++) {
    circulos.push(new Circulo());
  }
}

// ─────────────────────────────────────────────
//  DRAW
// ─────────────────────────────────────────────
function draw() {
  background(0);

  if (modeloCargado) procesarAudio();

  let alpha = NIVELES_OPACIDAD[nivelOpacidad];
  for (let c of circulos) {
    c.dibujar(alpha);
  }
  noTint();

  // Marco blanco
  noStroke();
  fill(255);
  rect(0, 0, width, MARCO);
  rect(0, height - MARCO, width, MARCO);
  rect(0, 0, MARCO, height);
  rect(width - MARCO, 0, MARCO, height);

  // Modo calibración
  mostrarCalibracion();
}

// ─────────────────────────────────────────────
//  PROCESAMIENTO DE AUDIO
// ─────────────────────────────────────────────
function procesarAudio() {
  let volCrudo = mic.getLevel();
  let ahora    = millis();

  // Filtrar amplitud (equivalente a GestorSenial para el volumen)
  let ampMapeada = map(volCrudo, AMP_MIN, AMP_MAX, 0.0, 1.0);
  ampMapeada     = constrain(ampMapeada, 0.0, 1.0);
  ampFiltrada    = ampFiltrada * FACTOR_SUAVIZADO + ampMapeada * (1 - FACTOR_SUAVIZADO);

  let haySonido        = ampFiltrada > UMBRAL_VOLUMEN;
  let inicioElSonido   = haySonido && !antesHabiaSonido;
  let finDelSonido     = !haySonido && antesHabiaSonido;

  if (inicioElSonido) {
    sonidoActivo             = true;
    tiempoInicioSonido       = ahora;
    volumenPicoSonido        = ampFiltrada;
    frecAcumulada            = frecActual;
    muestrasFrilladas        = 1;
    sonidoMantenidoYaContado = false;
  }

  if (sonidoActivo && haySonido) {
    if (ampFiltrada > volumenPicoSonido) volumenPicoSonido = ampFiltrada;
    if (frecActual > 0) {
      frecAcumulada += frecActual;
      muestrasFrilladas++;
    }

    let duracion = ahora - tiempoInicioSonido;

    // Detectar grave mantenido mientras dura el sonido
    if (!sonidoMantenidoYaContado && duracion >= UMBRAL_MANTENIDO) {
      let frecPromedio = muestrasFrilladas > 0 ? frecAcumulada / muestrasFrilladas : 0;
      let esGrave      = frecPromedio < UMBRAL_FRECUENCIA && frecPromedio > 0;
      if (esGrave && ahora - ultimoMantenido > COOLDOWN) {
        cambiarOpacidad();
        ultimoMantenido          = ahora;
        sonidoMantenidoYaContado = true;
      }
    }
  }

  if (finDelSonido) {
    let duracion     = ahora - tiempoInicioSonido;
    let frecPromedio = muestrasFrilladas > 0 ? frecAcumulada / muestrasFrilladas : 0;
    let esGrave      = frecPromedio < UMBRAL_FRECUENCIA && frecPromedio > 0;
    if (!sonidoMantenidoYaContado) {
      if (esGrave && ahora - ultimoGrave > COOLDOWN) {
        avanzarGrave();
        ultimoGrave = ahora;
      } else if (!esGrave && frecPromedio > 0 && ahora - ultimoAgudo > COOLDOWN) {
        avanzarAgudo();
        ultimoAgudo = ahora;
      }
    }

    sonidoActivo = false;
  }

  antesHabiaSonido = haySonido;
}

// ─────────────────────────────────────────────
//  MODO CALIBRACIÓN
// ─────────────────────────────────────────────
function mostrarCalibracion() {
  if (!modoCalibrar) return;

  let esSonido = ampFiltrada > UMBRAL_VOLUMEN;

  fill(0, 0, 0, 190);
  noStroke();
  rect(MARCO, MARCO, width - MARCO * 2, 140);

  textFont('monospace');
  textSize(11);

  fill(esSonido ? color(100, 255, 100) : color(180));
  text(`volumen:  ${ampFiltrada.toFixed(4)}  (umbral: ${UMBRAL_VOLUMEN})`, MARCO + 8, MARCO + 18);

  let esGraveAhora = frecActual > 0 && frecActual < UMBRAL_FRECUENCIA;
  fill(esGraveAhora ? color(100, 200, 255) : color(255, 120, 120));
  text(`frecuencia: ${int(frecActual)} Hz  (umbral: ${UMBRAL_FRECUENCIA} Hz)`, MARCO + 8, MARCO + 34);

  // Barra de frecuencia
  let barW   = width - MARCO * 2 - 16;
  let barVal = constrain(map(frecActual, FREC_MIN, FREC_MAX, 0, barW), 0, barW);
  let corteX = map(UMBRAL_FRECUENCIA, FREC_MIN, FREC_MAX, 0, barW);
  fill(40);
  rect(MARCO + 8, MARCO + 40, barW, 8);
  fill(esGraveAhora ? color(100, 200, 255) : color(255, 120, 120));
  rect(MARCO + 8, MARCO + 40, barVal, 8);
  stroke(255, 220, 80);
  line(MARCO + 8 + corteX, MARCO + 38, MARCO + 8 + corteX, MARCO + 50);
  noStroke();

  let tipo = '—';
  if (esSonido) {
    let dur = millis() - tiempoInicioSonido;
    let esC = volumenPicoSonido >= UMBRAL_CHASQUIDO && dur < DURACION_CHASQUIDO;
    if (esC)                        tipo = 'CHASQUIDO';
    else if (dur >= UMBRAL_MANTENIDO) tipo = esGraveAhora ? 'GRAVE MANTENIDO' : '(agudo mantenido)';
    else                            tipo = esGraveAhora ? 'grave corto' : 'agudo corto';
  }
  fill(255, 220, 80);
  text(`tipo: ${tipo}`, MARCO + 8, MARCO + 68);

  fill(180);
  text(`pico: ${volumenPicoSonido.toFixed(4)}  (umbral chasquido: ${UMBRAL_CHASQUIDO})`, MARCO + 8, MARCO + 84);
  text(`grave:${contadorGrave}  agudo:${contadorAgudo}  opacidad:${nivelOpacidad}`, MARCO + 8, MARCO + 100);
  text(`modelo: ${modeloCargado ? 'listo' : 'cargando...'}`, MARCO + 8, MARCO + 116);
  text(`M = cerrar calibracion`, MARCO + 8, MARCO + 132);
}

// ─────────────────────────────────────────────
//  LÓGICA DE COLOR POR POSICIÓN
// ─────────────────────────────────────────────
function elegirImagen(x) {
  let esDerecha   = x > width / 2;
  let esIzquierda = !esDerecha;

  if (contadorGrave === 0 && contadorAgudo === 0) return imgBlanco;
  if (contadorGrave === 1 && contadorAgudo === 0) return esDerecha ? imgAzul : imgBlanco;
  if (contadorGrave === 2 && contadorAgudo === 0) return imgAzul;
  if (contadorGrave === 0 && contadorAgudo === 1) return esIzquierda ? imgRojo : imgBlanco;
  if (contadorGrave === 0 && contadorAgudo === 2) return imgRojo;
  if (contadorGrave === 1 && contadorAgudo === 1) return esIzquierda ? imgRojo : imgAzul;
  if (contadorGrave === 2) return imgAzul;
  if (contadorAgudo === 2) return imgRojo;

  return imgBlanco;
}

// ─────────────────────────────────────────────
//  TECLAS
// ─────────────────────────────────────────────
function keyPressed() {
  if (key === 'm' || key === 'M') modoCalibrar = !modoCalibrar;
  return false;
}

// ─────────────────────────────────────────────
//  LÓGICA DE CONTADORES
// ─────────────────────────────────────────────
function avanzarGrave() {
  if (contadorAgudo === 2 && contadorGrave === 0) {
    contadorGrave = 1; contadorAgudo = 1; return;
  }
  contadorGrave++;
  if (contadorGrave >= 3) { contadorGrave = 0; contadorAgudo = 0; }
  else if (contadorGrave === 2) { contadorAgudo = 0; }
}

function avanzarAgudo() {
  if (contadorGrave === 2 && contadorAgudo === 0) {
    contadorGrave = 1; contadorAgudo = 1; return;
  }
  contadorAgudo++;
  if (contadorAgudo >= 3) { contadorAgudo = 0; contadorGrave = 0; }
  else if (contadorAgudo === 2) { contadorGrave = 0; }
}

function cambiarOpacidad() {
  nivelOpacidad += dirOpacidad;
  if (nivelOpacidad >= 3) { nivelOpacidad = 3; dirOpacidad = -1; }
  else if (nivelOpacidad <= 0) { nivelOpacidad = 0; dirOpacidad = 1; }
}

function resetTotal() {
  contadorGrave = 0;
  contadorAgudo = 0;
  nivelOpacidad = 0;
  dirOpacidad   = 1;
}

// ─────────────────────────────────────────────
//  CLASE CIRCULO
// ─────────────────────────────────────────────
class Circulo {
  constructor() {
    this.x   = random(MARCO, width  - MARCO);
    this.y   = random(MARCO, height - MARCO);
    this.tam = random(TAMANIO_MIN, TAMANIO_MAX);
  }

  dibujar(alpha) {
    tint(255, alpha);
    image(elegirImagen(this.x), this.x, this.y, this.tam, this.tam);
  }
}