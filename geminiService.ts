
import { Language, EchoPersona, ActivityType } from "./types";

// Backend proxy — used when available; rich local library is always the fallback
const PROXY_URL = 'https://volunteer.healthmatters.clinic/api/calmkit';

const proxyCall = async (endpoint: string, body: Record<string, any>): Promise<any> => {
  const res = await fetch(`${PROXY_URL}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Proxy ${endpoint} failed: ${res.status}`);
  return res.json();
};

// ─────────────────────────────────────────────────────────────
// LOCAL COACHING LIBRARY
// Written specifically for Black & Latino communities in LA.
// Trauma-informed. Culturally grounded. No toxic positivity.
// ─────────────────────────────────────────────────────────────

type ScriptContext = {
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  weather?: string;    // 'sunny' | 'cloudy' | 'hot' | 'cool' | 'smoggy' | 'evening'
  temp?: number;       // celsius
  aqIndex?: number;
  isIntro: boolean;
  isReturning?: boolean;
  segmentNumber?: number;
  targetThought?: string;
  distanceMiles?: number;
  sessionMinutes?: number;
};

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// HOPE — Safety, self-compassion, trauma-informed grounding
const HOPE_SCRIPTS = {
  en: {
    intro: [
      "Welcome. I'm glad you're here. Whatever is weighing on you right now, you can set it down for these next few minutes. Your only job is to breathe and move. That's it.",
      "Hey — you showed up. That matters more than you know. Start slow. Feel the pavement under your feet — that is real, that is now. You have survived 100% of your hardest days. This one is just another one you're going to get through.",
      "Before we move — take one breath. Not because you have to. Because you're still here, and that's worth acknowledging. When you're ready, let's go.",
      "This is your time. The demands of the day — your family, your work, the noise of the city — that's out there. Right now, it's just you and this moment. Let's move through it together.",
      "Some days just getting out the door is the win. If that's where you are today, good. You did it. We'll take this one block at a time.",
    ],
    moving: [
      "Notice your breathing — not to control it, just to feel it. You've been breathing through hard things your whole life. Your body knows how to do this.",
      "Look around you. You're moving through your community. The streets, the people, the energy of this neighborhood — you're part of it. You belong here.",
      "There's a kind of strength that doesn't look strong. It looks like showing up on a hard day. Like choosing yourself when everything in you wanted to give up. That's what you're doing right now.",
      "Your pace is right. Not too fast, not too slow — wherever your body is today is exactly where it needs to be. Trust that.",
      "If something in your chest feels heavy right now, that's okay. Let the movement carry a little of it. You don't have to be fixed to be moving forward.",
      "You were built to survive things that would break most people. And today, you're choosing healing instead of just surviving. That's the real move.",
      "Notice the streets around you. Every person out here is carrying something. You are not alone in this.",
    ],
    midpoint: [
      "You're still moving. Your body has been showing up for you this whole time — heart beating, lungs breathing. Even when you felt like you couldn't. Take a quiet moment to acknowledge that.",
      "Sometimes healing looks quiet. It looks like a walk through the neighborhood. It looks like this — choosing to keep moving even when everything in you wanted to stay still.",
      "You are not a problem to be solved. You are a person who deserves care. That's not something you have to earn. That's just true.",
    ],
    end: [
      "You stayed. That's the whole thing — you stayed with yourself through this. Bring that energy into the rest of your day.",
      "End of this session. Whatever you're carrying, you've been carrying it with a little more grace today. That matters.",
      "Slow it down for a second. Feel your feet on the ground. Feel this moment. You made it.",
    ],
  },
  es: {
    intro: [
      "Bienvenido. Me alegra que estés aquí. Lo que sea que estés cargando ahora mismo, puedes soltarlo por estos minutos. Tu único trabajo es respirar y moverte. Eso es todo.",
      "Llegaste. Eso importa más de lo que crees. Empieza despacio. Siente el pavimento bajo tus pies — eso es real, eso es ahora. Has sobrevivido el 100% de tus días más difíciles. Este es solo uno más que vas a superar.",
      "Antes de movernos — toma una respiración. No porque tengas que hacerlo. Sino porque aún estás aquí, y eso vale la pena reconocerlo.",
    ],
    moving: [
      "Observa tu respiración — no para controlarla, solo para sentirla. Has respirado a través de cosas difíciles toda tu vida. Tu cuerpo sabe cómo hacer esto.",
      "Mira a tu alrededor. Te estás moviendo por tu comunidad. Las calles, la gente, la energía de este vecindario — formas parte de ello. Perteneces aquí.",
      "Hay un tipo de fortaleza que no se ve fuerte. Se ve como presentarse en un día difícil. Como elegirte a ti mismo cuando todo en ti quería rendirse. Eso es lo que estás haciendo ahora.",
      "Tu ritmo está bien. Donde tu cuerpo está hoy es exactamente donde necesita estar. Confía en eso.",
    ],
    midpoint: [
      "A mitad del camino. Tu cuerpo ha estado apareciendo por ti todo este tiempo — corazón latiendo, pulmones respirando. Incluso cuando sentiste que no podías.",
    ],
    end: [
      "Te quedaste. Eso es todo — te quedaste contigo mismo durante esto. Lleva eso contigo el resto del día.",
      "Fin de esta sesión. Lo que sea que estés cargando, lo has llevado con un poco más de gracia hoy.",
    ],
  },
};

// HYPE — Activation, momentum, culturally grounded LA energy
const HYPE_SCRIPTS = {
  en: {
    intro: [
      "Welcome — and let's get into it. No warm-up speech — your body already knows what time it is. Channel that energy and move.",
      "Hey, I'm glad you're here. You want change? Change doesn't wait for a perfect day. This is the day. Right now. Let's build.",
      "Glad you showed up. Where you're from, getting up every day is already an act of power. Most people don't get that. You do. Now add this. Move.",
      "Let's go. LA sharpened you — to move with purpose, think on your feet, keep going when it gets hard. That's not a skill everyone has. Use it today.",
      "No excuses today. Not from the outside — from yourself. You know what you're capable of. Let's go show you.",
    ],
    moving: [
      "This right here — this pace, this breath, this decision — this is you building something. Block by block. Day by day.",
      "You didn't come from nothing. You came from people who built something from nothing. That's in you. Use it.",
      "Every step is a rep. You're training your mind as much as your body. What's the thought you came in with? Leave it a few blocks back.",
      "When this feels hard, that's the signal — not to stop, to switch gears. You know how to switch gears. Do it.",
      "Notice your rhythm. Feel it. You're moving through your community right now — every block you cover is yours.",
      "Momentum is everything. Don't let a slow moment become a stopped moment. Keep going.",
      "You are unstoppable. Say it to yourself if you need to. It's the truth.",
    ],
    midpoint: [
      "More than halfway. Your body said yes when your mind wanted to negotiate. Listen to your body — it's smarter than the doubt.",
      "Past the midpoint. You showed up and you're still here. Finish strong.",
    ],
    end: [
      "That's how it's done. Show up, do the work, carry it with you. Don't let this energy disappear — use it today.",
      "You just did something your future self needed. Remember that.",
      "Done. Now take that same energy into everything else today. You've got it.",
    ],
  },
  es: {
    intro: [
      "Bienvenido — y vamos a entrar en ello. Sin discurso de calentamiento — tu cuerpo ya sabe qué hora es. Canaliza esa energía y muévete.",
      "Me alegra que estés aquí. ¿Quieres cambio? El cambio no espera un día perfecto. Este es el día. Ahora mismo. Construyamos.",
      "De donde eres, levantarte cada día ya es un acto de poder. La mayoría no entiende eso. Tú sí. Ahora agrega esto. Muévete.",
    ],
    moving: [
      "Cada paso es una repetición. Estás entrenando tu mente tanto como tu cuerpo.",
      "Cuando esto se siente difícil, esa es la señal — no para parar, sino para cambiar de marcha. Tú sabes cómo hacerlo.",
      "El impulso lo es todo. No dejes que un momento lento se convierta en un momento detenido. Sigue.",
      "Eres imparable. Dítelo a ti mismo si lo necesitas. Es la verdad.",
    ],
    midpoint: [
      "Más de la mitad. Tu cuerpo dijo sí cuando tu mente quería negociar. Escucha a tu cuerpo.",
    ],
    end: [
      "Así es como se hace. Preséntate, haz el trabajo, llévalo contigo. No dejes que esta energía desaparezca.",
    ],
  },
};

// BREAKTHROUGH — Insight, pattern interruption, cognitive reframing
const BREAKTHROUGH_SCRIPTS = {
  en: {
    intro: [
      "Welcome. I'm glad you made it out here. Before we move — what's the story you've been telling yourself lately? Not the facts, the story. We're going to move through it today.",
      "Clarity doesn't always arrive sitting still. Sometimes it comes mid-stride, when you stop forcing it. Let's move and let it come.",
      "Hey — pay attention to what shows up in the quiet between steps today. You came here with something on your mind. Don't solve it yet. Just walk with it.",
      "Welcome. You came here with something on your mind. Don't try to fix it yet — just walk with it. Let the movement do some of the work.",
    ],
    moving: [
      "The thought you came in with — is it actually true? Or is it a thought that's been around so long it started to feel like a fact?",
      "Notice what you're holding in your body right now. Tight shoulders, clenched jaw — that's a message. What is it telling you?",
      "Look at the street around you. You're moving through your community. Sometimes a change in perspective starts with a change in location.",
      "What would change if you stopped seeing this as a problem to solve and started seeing it as information to understand?",
      "The thing you keep avoiding thinking about — what's one true thing you know about it that you've been pretending you don't?",
      "Most of the weight you carry isn't yours to carry alone. Some of it was given to you. You're allowed to put that part down.",
      "You've been in this situation before — different details, same feeling. What did that version of you figure out that this version hasn't remembered yet?",
    ],
    midpoint: [
      "Pause on this — what's one belief you have about yourself that you'd be better off without? You don't have to replace it. Just name it.",
      "What if the hardest thing happening in your life right now is also the thing that's teaching you the most? What's the lesson you're resisting?",
    ],
    end: [
      "Take something back with you. Not a decision, not a plan — just one true thing you saw more clearly today.",
      "Breakthrough doesn't always feel like a lightning bolt. Sometimes it's a quiet shift. Pay attention to any quiet shifts today.",
      "You don't have to figure everything out today. But you're one walk closer to clarity. That's real.",
    ],
  },
  es: {
    intro: [
      "Bienvenido. Me alegra que hayas llegado. Antes de movernos — ¿cuál es la historia que te has estado contando últimamente? No los hechos, la historia. Vamos a movernos a través de ella hoy.",
      "La claridad no siempre llega cuando estás quieto. A veces viene a medio paso, cuando dejas de forzarla.",
    ],
    moving: [
      "El pensamiento con el que llegaste — ¿es realmente verdad? ¿O es un pensamiento que ha estado tanto tiempo que empezó a sentirse como un hecho?",
      "Lo que sigues evitando pensar — ¿cuál es una cosa verdadera que sabes sobre eso que has estado fingiendo que no sabes?",
      "Mira la calle a tu alrededor. Estás moviéndote por tu comunidad. A veces un cambio de perspectiva comienza con un cambio de lugar.",
    ],
    midpoint: [
      "¿Qué cambiaría si dejaras de ver esto como un problema a resolver y empezaras a verlo como información para entender?",
    ],
    end: [
      "Llévate algo contigo. No una decisión, no un plan — solo una cosa verdadera que viste con más claridad hoy.",
    ],
  },
};

// STRATEGY — Structured, CBT-adjacent, practical direction
const STRATEGY_SCRIPTS = {
  en: {
    intro: [
      "Welcome. Let's get to work. Before we start — name the actual problem. Not the feeling around it, the specific problem. Hold that. We're going to think through it while we move.",
      "Hey — I'm glad you're here. You're a problem-solver. That's how you're wired. Let's use that. What's the one thing that, if it changed, would change everything else?",
      "Welcome. Break it down while we walk. Big problems feel impossible until you separate the parts. Let's separate the parts.",
      "You've solved hard things before. You're going to solve this one too. Let's think clearly — one block at a time.",
    ],
    moving: [
      "For whatever you're working through — what's actually in your control right now? Not eventually. Right now. Start there.",
      "Separate what's urgent from what's important. Most of what feels urgent isn't. What's actually important right now?",
      "What's one decision you've been avoiding? Not because you don't know the answer — but because the answer is uncomfortable. Name it.",
      "Your energy is a resource. Where are you spending it on things that aren't moving the needle? What would you stop if you were thinking clearly?",
      "Notice the streets around you. You're moving through your community — the same one you're trying to show up for. Take care of yourself so you can keep showing up.",
      "What does the next right step look like — not the whole solution, just the next right step? That's the only thing you actually have to figure out today.",
    ],
    midpoint: [
      "Check in — is the problem still looking the same as when you started? Sometimes movement changes the angle. What do you see now that you didn't see before?",
    ],
    end: [
      "Leave this session with one action. One specific thing you'll do differently based on what you thought through today.",
      "Clarity is a practice. You just practiced it. Use what you figured out.",
      "You didn't solve everything today — but you moved toward it. That's how it works.",
    ],
  },
  es: {
    intro: [
      "Bienvenido. Vamos a trabajar. Antes de comenzar — nombra el problema real. No el sentimiento alrededor de él, el problema específico. Guárdalo. Vamos a pensar en eso mientras nos movemos.",
    ],
    moving: [
      "Para lo que estás trabajando — ¿qué está realmente en tu control ahora mismo? No eventualmente. Ahora mismo. Empieza por ahí.",
      "¿Cuál es una decisión que has estado evitando? No porque no sepas la respuesta — sino porque la respuesta es incómoda.",
      "Nota las calles a tu alrededor. Estás moviéndote por tu comunidad — la misma por la que intentas aparecer. Cuídate para poder seguir presentándote.",
    ],
    midpoint: [
      "Verifica — ¿el problema todavía se ve igual que cuando empezaste? A veces el movimiento cambia el ángulo.",
    ],
    end: [
      "Sal de esta sesión con una acción. Una cosa específica que harás diferente basada en lo que pensaste hoy.",
    ],
  },
};

// Weather-aware openers — urban LA setting, flat streets, community focus
const WEATHER_OPENERS = {
  en: {
    hot: [
      "It's warm out here — LA heat is real. Pace yourself. Stay hydrated. That heat isn't stopping you — take it as evidence of what you can handle.",
      "The heat today is real. Your body is regulating it right now, without you having to think about it. Take it slow, keep moving, take care of yourself.",
    ],
    smoggy: [
      "The air quality is rough today — take it easy with your breathing. Short breaths through the nose. Your pace matters less than your presence right now.",
      "High smog day in LA. Breathe easy, move steady. Your community deserves clean air — that's worth fighting for. But right now, just take care of yourself.",
    ],
    cool: [
      "It's cool out here — that's a gift in LA. Your lungs open up in this. Use it.",
      "Cool air, open streets. This is what it feels like to have the city on your side for a minute.",
    ],
    cloudy: [
      "Overcast day — that LA marine layer is out. But notice you still came out. That says something.",
      "Gray skies don't mean a gray day. Some of the clearest thinking happens on days like this.",
    ],
    morning: [
      "Morning. The streets are yours right now. Before the day puts its demands on you — this time is yours first.",
      "You got up and came out. Before anyone else needed anything from you, you chose yourself. That's the right order.",
    ],
    evening: [
      "Evening. The city is winding down. Let the movement help you transition out of the day.",
      "End of the day. Whatever happened out there, you're here now. Let this be the exhale.",
    ],
  },
  es: {
    hot: ["Hace calor — el calor de LA es real. Mantén tu ritmo. Ese calor no te está deteniendo — tómalo como evidencia de lo que puedes manejar."],
    smoggy: ["La calidad del aire es mala hoy — respira con calma. Respiraciones cortas por la nariz."],
    cool: ["Está fresco hoy — eso es un regalo en LA. Tus pulmones se abren con esto. Úsalo."],
    cloudy: ["Día nublado. Pero nota — aun así saliste. Eso dice algo."],
    morning: ["Mañana. Las calles son tuyas ahora. Antes de que el día ponga sus demandas en ti — esto es tuyo primero."],
    evening: ["La tarde. La ciudad se está calmando. Deja que el movimiento te ayude a salir del día."],
  },
};

// Journal prompts — cognitive reframing, not gratitude lists
const JOURNAL_PROMPTS = {
  en: [
    "What's a story you've been telling yourself that might be keeping you stuck?",
    "What are you outgrowing right now — and what's making it hard to let go?",
    "When did you last feel genuinely proud of yourself, and what made it feel different than usual?",
    "What's something you know you need to do that you've been avoiding — and what's the actual reason you're avoiding it?",
    "Describe one moment from the last week where you handled something better than you expected.",
    "What would you tell someone you love who was facing exactly what you're facing right now?",
    "What does 'being okay' look like for you — not perfect, just okay?",
    "What's one thing that feels heavy right now, and what would it mean to put it down, even temporarily?",
    "Who in your life makes you feel most like yourself? What is it about them?",
    "What's one belief about yourself you received from someone else that you haven't actually decided you agree with?",
    "If the version of you from five years ago could see where you are now, what would they be surprised by?",
    "What does your body need right now that your mind keeps arguing with?",
  ],
  es: [
    "¿Qué historia te estás contando a ti mismo que podría estar manteniéndote estancado?",
    "¿Qué estás superando ahora mismo — y qué hace que sea difícil dejarlo ir?",
    "¿Cuándo fue la última vez que te sentiste genuinamente orgulloso de ti mismo, y qué lo hizo sentir diferente a lo usual?",
    "¿Qué es algo que sabes que necesitas hacer y que has estado evitando — y cuál es la razón real por la que lo evitas?",
    "Describe un momento de la última semana en el que manejaste algo mejor de lo que esperabas.",
    "¿Qué le dirías a alguien que amas que estuviera enfrentando exactamente lo que tú estás enfrentando ahora mismo?",
    "¿Qué significa 'estar bien' para ti — no perfecto, solo bien?",
    "¿Qué es algo que se siente pesado ahora mismo, y qué significaría soltarlo, aunque sea temporalmente?",
    "¿Quién en tu vida te hace sentir más como tú mismo? ¿Qué tiene esa persona?",
    "¿Cuál es una creencia sobre ti mismo que recibiste de alguien más, que en realidad no has decidido si estás de acuerdo?",
  ],
};

// Affirmations — UNSTOPPABLE-themed, coach energy, community-rooted
const AFFIRMATIONS = {
  en: [
    "You are unstoppable.",
    "You showed up today — that takes courage.",
    "Your presence is your power.",
    "You belong here. You matter.",
    "Every step forward is proof of your strength.",
    "You were built for this.",
    "Showing up for yourself is the most powerful thing you can do.",
    "You are not alone in this — your community is with you.",
    "The fact that you're still here is the whole victory.",
    "You carry more strength than you give yourself credit for.",
    "Your resilience is not a small thing. It is everything.",
    "Taking action — even one small step — changes everything.",
    "You don't have to feel ready to be unstoppable. You already are.",
    "What you're doing for yourself, you're doing for everyone around you.",
    "You've survived every hard day so far. Today is no different.",
  ],
  es: [
    "Eres imparable.",
    "Te presentaste hoy — eso requiere valentía.",
    "Tu presencia es tu poder.",
    "Perteneces aquí. Tú importas.",
    "Cada paso adelante es prueba de tu fortaleza.",
    "Fuiste hecho para esto.",
    "Presentarte por ti mismo es lo más poderoso que puedes hacer.",
    "No estás solo en esto — tu comunidad está contigo.",
    "El hecho de que aún estés aquí es la victoria completa.",
    "Llevas más fortaleza de la que te das crédito.",
    "Tu resiliencia no es poca cosa. Lo es todo.",
    "Tomar acción — incluso un pequeño paso — cambia todo.",
  ],
};

// Meditation scripts — 90–120 word guided presence
const MEDITATION_SCRIPTS = {
  en: [
    `Close your eyes if you can. Feel the weight of your body — the ground holding you. You don't have to hold yourself up right now. Let it do that work.

Take a breath in through your nose — slow and full. Hold it at the top. Now let it go through your mouth. Let the exhale be longer than the inhale.

You are here. Not where you were this morning. Not where you'll be tonight. Here. This room. This breath. This moment.

Notice any place in your body where you're holding tension. You don't have to fix it — just acknowledge it. Say: I see you. And then breathe into it.

You arrived today. Whatever it took to get here — it was enough.`,

    `Sit with your feet flat on the ground if you can. Feel where your body meets the chair or floor — that contact is real. That's something you can trust right now.

Breathe naturally — don't force it. Just observe the rhythm your body already knows.

Let your thoughts come. Don't chase them and don't push them away. They're just thoughts — not facts, not commands. Watch them pass.

On your next inhale, breathe in the word: present. On the exhale, release: future. Present. Future. Do that three times.

You don't need to solve anything right now. This moment has one job — to be exactly what it is.`,
  ],
  es: [
    `Cierra los ojos si puedes. Siente el peso de tu cuerpo — el suelo sosteniéndote. No tienes que sostenerte ahora mismo. Deja que haga ese trabajo.

Toma una respiración por la nariz — lenta y profunda. Mantenla en la cima. Ahora suéltala por la boca. Deja que la exhalación sea más larga que la inhalación.

Estás aquí. No donde estabas esta mañana. No donde estarás esta noche. Aquí. Este lugar. Esta respiración. Este momento.

Llegaste hoy. Lo que sea que tomó para llegar aquí — fue suficiente.`,
  ],
};

// Build context-aware narrative from local library
const buildLocalNarrative = (params: {
  mode: EchoPersona;
  lang: Language;
  isIntro: boolean;
  isReturning?: boolean;
  segmentNumber?: number;
  timeOfDay: string;
  weatherCondition?: string;
  temperature?: number;
  airQualityIndex?: number;
  targetThought?: string;
  distanceMiles?: number;
  sessionMinutes?: number;
}): string => {
  const l = params.lang === 'es' ? 'es' : 'en';
  const scriptMap: Record<EchoPersona, typeof HOPE_SCRIPTS.en> = {
    HOPE: HOPE_SCRIPTS[l],
    HYPE: HYPE_SCRIPTS[l],
    BREAKTHROUGH: BREAKTHROUGH_SCRIPTS[l],
    STRATEGY: STRATEGY_SCRIPTS[l],
  };

  const scripts = scriptMap[params.mode] || HOPE_SCRIPTS[l];
  const weatherScripts = WEATHER_OPENERS[l];

  // Intro: optionally prefix with weather context
  if (params.isIntro) {
    let weatherOpener = '';
    if (params.temperature !== undefined && params.temperature > 30) {
      weatherOpener = pick(weatherScripts.hot) + ' ';
    } else if (params.airQualityIndex !== undefined && params.airQualityIndex > 100) {
      weatherOpener = pick(weatherScripts.smoggy) + ' ';
    } else if (params.temperature !== undefined && params.temperature < 18) {
      weatherOpener = pick(weatherScripts.cool) + ' ';
    } else if (params.weatherCondition?.toLowerCase().includes('cloud') || params.weatherCondition?.toLowerCase().includes('overcast')) {
      weatherOpener = pick(weatherScripts.cloudy) + ' ';
    } else if (params.timeOfDay === 'morning') {
      weatherOpener = pick(weatherScripts.morning) + ' ';
    } else if (params.timeOfDay === 'evening') {
      weatherOpener = pick(weatherScripts.evening) + ' ';
    }
    return weatherOpener + pick(scripts.intro);
  }

  // Midpoint / End
  const seg = params.segmentNumber || 1;
  const totalExpected = 4;
  const isMidpoint = seg === Math.floor(totalExpected / 2);
  const isEnd = params.sessionMinutes !== undefined && params.sessionMinutes > 20;

  if (isEnd && scripts.end?.length) return pick(scripts.end);
  if (isMidpoint && scripts.midpoint?.length) return pick(scripts.midpoint);
  return pick(scripts.moving);
};

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────

export const generateSegmentNarrative = async (params: {
  mode: EchoPersona;
  activity: ActivityType;
  lang: Language;
  stats: { distance: number; time: number; pace: string };
  isIntro: boolean;
  isFirstSegment: boolean;
  isReturning?: boolean;
  indoorActivity?: string;
  segmentNumber?: number;
  destinationName?: string;
  targetThought?: string;
  userLat?: number;
  userLng?: number;
  weatherCondition?: string;
  temperature?: number;
  windSpeed?: number;
  airQualityIndex?: number;
  airQualityCategory?: string;
  elevationGain?: number;
  elevationDelta?: number;
  speed?: number;
}) => {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const sessionMinutes = Math.floor((params.stats?.time || 0) / 60);

  // Try proxy first (when portal endpoint is live)
  try {
    const data = await proxyCall('movement-narrative', {
      mode: params.mode,
      activity: params.activity || 'WALK',
      lang: params.lang,
      destinationName: params.destinationName,
      targetThought: params.targetThought,
      timeOfDay,
      sessionMinutes,
      distanceMiles: params.stats?.distance || 0,
      isIntro: params.isIntro,
      isFirstSegment: params.isFirstSegment,
      isReturning: params.isReturning,
      indoorActivity: params.indoorActivity,
      segmentNumber: params.segmentNumber,
      ...(params.weatherCondition && { weatherCondition: params.weatherCondition }),
      ...(params.temperature !== undefined && { temperature: params.temperature }),
      ...(params.windSpeed !== undefined && { windSpeed: params.windSpeed }),
      ...(params.airQualityIndex !== undefined && { airQualityIndex: params.airQualityIndex }),
      ...(params.airQualityCategory && { airQualityCategory: params.airQualityCategory }),
      ...(params.elevationGain !== undefined && params.elevationGain > 0 && { elevationGain: Math.round(params.elevationGain) }),
      ...(params.elevationDelta !== undefined && { elevationDelta: Math.round(params.elevationDelta) }),
      ...(params.speed !== undefined && params.speed > 0 && { speed: params.speed }),
    });
    if (data.preStartIntro) return data.preStartIntro;
    return data.narration || "";
  } catch {
    // Proxy unavailable — use rich local library
    return buildLocalNarrative({
      mode: params.mode,
      lang: params.lang,
      isIntro: params.isIntro,
      isReturning: params.isReturning,
      segmentNumber: params.segmentNumber,
      timeOfDay,
      weatherCondition: params.weatherCondition,
      temperature: params.temperature,
      airQualityIndex: params.airQualityIndex,
      targetThought: params.targetThought,
      distanceMiles: params.stats?.distance,
      sessionMinutes,
    });
  }
};

export const generateEndingMessage = async (params: {
  mode: EchoPersona;
  lang: Language;
  stats: { distance: number; time: number; pace: string };
}) => {
  try {
    const data = await proxyCall('ending', { mode: params.mode, lang: params.lang, stats: params.stats });
    return data.message || "";
  } catch {
    const l = params.lang === 'es' ? 'es' : 'en';
    const scriptMap: Record<EchoPersona, typeof HOPE_SCRIPTS.en> = {
      HOPE: HOPE_SCRIPTS[l], HYPE: HYPE_SCRIPTS[l],
      BREAKTHROUGH: BREAKTHROUGH_SCRIPTS[l], STRATEGY: STRATEGY_SCRIPTS[l],
    };
    const scripts = scriptMap[params.mode];
    const dist = params.stats.distance.toFixed(2);
    const mins = Math.floor(params.stats.time / 60);
    const ending = scripts.end?.length ? pick(scripts.end) : '';
    const stats = params.lang === 'es'
      ? `${dist} millas. ${mins} minutos. `
      : `${dist} miles. ${mins} minutes. `;
    return stats + ending;
  }
};

export const generateAffirmation = async (lang: Language) => {
  try {
    const data = await proxyCall('affirmation', { lang });
    return data.affirmation || "";
  } catch {
    return pick(AFFIRMATIONS[lang === 'es' ? 'es' : 'en']);
  }
};

export const generateJournalPrompt = async (lang: Language) => {
  try {
    const data = await proxyCall('journal-prompt', { lang });
    return data.prompt || "";
  } catch {
    return pick(JOURNAL_PROMPTS[lang === 'es' ? 'es' : 'en']);
  }
};

export const generateMeditationScript = async (lang: Language) => {
  try {
    const data = await proxyCall('meditation', { lang });
    return data.script || "";
  } catch {
    return pick(MEDITATION_SCRIPTS[lang === 'es' ? 'es' : 'en']);
  }
};
