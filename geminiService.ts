
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
// LOCAL COACHING LIBRARY — UNSTOPPABLE SEASON 2026
// Written for Black & Latino communities in LA.
// Trauma-informed. Culturally rooted. CBT-grounded.
// No toxic positivity. No performance metrics. No clichés.
//
// VOICE CADENCE (preserved from behavioral UX spec):
//   HOPE       → Legato, flowing, warm. Long sentences, soft rhythm.
//   HYPE       → Staccato, punchy, commanding. Short bursts. High energy.
//   BREAKTHROUGH → Resonant, questioning, emotionally intelligent.
//   STRATEGY   → Measured, composed, calm clarity.
// ─────────────────────────────────────────────────────────────

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

// ── SPONSOR / AD ──────────────────────────────────────────────
// Played once per session, naturally integrated.
const SPONSOR_LINES = {
  en: [
    "This moment is supported by Health Matters Clinic — an official Take Action LA 2026 community partner. Three free events in Los Angeles this May. You deserve access to care. Visit healthmatters.clinic to learn more.",
    "A note from your session host — Health Matters Clinic and LACDMH are bringing the Unstoppable Season to LA this May. Free events, free resources, open to everyone. Details at healthmatters.clinic.",
    "This space is made possible by partners who believe wellness belongs to everyone — Health Matters Clinic, a Take Action LA community partner. Free mental health events in LA this May. You belong there.",
  ],
  es: [
    "Este momento está apoyado por Health Matters Clinic — un socio oficial de Take Action LA 2026. Tres eventos gratuitos en Los Ángeles este mayo. Mereces acceso al cuidado. Visita healthmatters.clinic.",
    "Health Matters Clinic y LACDMH traen la Temporada Imparable a LA este mayo. Eventos gratuitos para toda la comunidad. Más información en healthmatters.clinic.",
  ],
};

// ── WEATHER — GREETING OPENERS ────────────────────────────────
// Prefix the greeting when conditions match.
const WEATHER_GREET = {
  en: {
    hot: [
      "It's warm out here — LA heat is real. Pace yourself. Stay hydrated. That heat isn't stopping you — take it as evidence of what you can handle.",
      "The city is running hot today. Respect it. Your pace matters more than your speed right now — moving steady through heat is still moving.",
    ],
    smoggy: [
      "Air quality is rough today — breathe through your nose, keep your breaths controlled. Your presence here still matters. Take care of your lungs while you do it.",
      "High smog day in LA. Short, deliberate breaths. Your community deserves clean air — and that fight is worth having. But right now, just take care of yourself.",
    ],
    cool: [
      "It's cool out here — that's a gift in LA. Your lungs open up in this. Let your breathing be full. Use it.",
      "Cool air and open streets. This is what it feels like when the city gives you something back. Take it.",
    ],
    cloudy: [
      "Overcast today — that LA marine layer is out. But notice: you still came out. The weather didn't get a vote in your decision. That says something.",
      "Gray skies don't mean a gray day. Some of the clearest thinking happens when the light is soft. Let's use it.",
    ],
    morning: [
      "Morning. The streets are yours right now. Before the day puts its demands on you — this time is yours first.",
      "You got up and came out. Before anyone else needed anything from you, you chose yourself. That's the right order.",
    ],
    afternoon: [
      "Afternoon out here — the day is already in motion around you. Now you're in motion too. Let's use this window.",
      "Midday. The city is loud and busy. You carved out time anyway. Use every minute of it.",
    ],
    evening: [
      "Evening. The city is starting to wind down. Let the movement help you transition — out of the day, into yourself.",
      "End of the day, and you still showed up. That's commitment. Now let this be the exhale your body has been waiting for.",
    ],
  },
  es: {
    hot: ["Hace calor — el calor de LA es real. Mantén tu ritmo. Que el calor no te detenga — tómalo como evidencia de lo que puedes manejar."],
    smoggy: ["La calidad del aire es mala hoy — respira por la nariz, mantén respiraciones controladas. Cuida tus pulmones."],
    cool: ["Está fresco hoy — eso es un regalo en LA. Tus pulmones se abren con esto. Deja que tu respiración sea profunda."],
    cloudy: ["Nublado hoy. Pero nota — aun así saliste. El clima no tuvo voto en tu decisión. Eso dice algo."],
    morning: ["Mañana. Las calles son tuyas ahora. Antes de que el día ponga sus demandas en ti — esto es tuyo primero."],
    afternoon: ["Mediodía. La ciudad está en pleno movimiento. Ahora tú también. Usa este tiempo."],
    evening: ["Tarde. La ciudad empieza a calmarse. Deja que el movimiento te ayude a salir del día y entrar en ti."],
  },
};

// ── WEATHER — MID-SESSION INSERTS ────────────────────────────
// Optionally prefixed to moving segments after minute 15.
const WEATHER_MID = {
  en: {
    hot: [
      "Still warm — listen to your body. Pace yourself. Staying in it matters more than the speed you do it at.",
      "Heat like this is information. Adapt and keep moving. There's more strength in pacing right than pushing wrong.",
    ],
    smoggy: [
      "Air's still rough out here — controlled breaths. Short and steady. Your community deserves better air than this. But today, take care of you.",
      "High smog day — moderate your effort. Your health is the goal, not the distance.",
    ],
    cool: [
      "Notice the air — still comfortable. Let your breathing be full. Your body is efficient right now. Trust it.",
      "Still cool out here. Use it. Your body is running well in this. Don't hold back.",
    ],
    morning: [
      "Still early. You're getting this done before the day has a chance to take it from you. Remember that.",
      "Morning sessions hit different. You're building the day before it builds you.",
    ],
    afternoon: [
      "Afternoon out here — the energy of the city is different at this hour. Work with what you have.",
      "Midday. The heat of the day and the heat of your effort — both real. Keep going.",
    ],
    evening: [
      "Evening now. The light is different. The pace of the city has shifted. Let your body match the rhythm of the hour.",
      "You're moving through the city at the end of its day. That quiet around you — let it work on you too.",
    ],
    cloudy: [
      "Marine layer's still out. No glare, softer light. Easier on the body than you think. Use it.",
    ],
  },
  es: {
    hot: ["Todavía hace calor — escucha a tu cuerpo. Hay más fortaleza en mantener el ritmo correcto que en empujar de manera incorrecta."],
    smoggy: ["Aire todavía difícil hoy — respiraciones cortas y controladas. Cuida tus pulmones."],
    cool: ["Todavía fresco. Deja que tu respiración sea profunda. Tu cuerpo está funcionando bien ahora. Confía en eso."],
    morning: ["Todavía temprano. Estás haciendo esto antes de que el día tenga la oportunidad de quitártelo."],
    evening: ["La ciudad está cambiando a su ritmo nocturno. Deja que tu cuerpo haga lo mismo."],
  },
};

// ─────────────────────────────────────────────────────────────
// HOPE — Safety, self-compassion, trauma-informed grounding.
// Voice: Legato, flowing sentences. Warm and steady.
// CBT: Body awareness, self-compassion reframes, safety cues.
// ─────────────────────────────────────────────────────────────
const HOPE_SCRIPTS = {
  en: {
    greeting: [
      "Take one breath before we move. Not because I'm asking — because you showed up today, and that deserves a moment. Whatever is weighing on you right now, you can set it down for this. Your only job right now is to breathe and move. That's it.",
      "Hey. I'm glad you're here. Some days, getting out the door is the whole victory — and if that's where you are, you've already won something real. Let's move through this together. One step at a time, at whatever pace your body gives you.",
      "Feel the ground under your feet right now. That's real. That's now. Whatever came before this moment — let it wait. Right now, the only thing that matters is that you're here, you're breathing, and you're moving. That's enough.",
      "You showed up. To yourself, to this community, to this moment. There's a kind of strength in that that doesn't always have a name. Start slow. Feel your body. We'll build from here.",
      "Before we start moving — take a second to just be here. You survived everything that tried to keep you from this moment. All of it. And still, you chose to come out today. That's not nothing. That's the whole thing. Now let's go.",
    ],
    moving: [
      // Early session
      "Notice your breathing — not to control it, just to feel it. You have been breathing through hard things your whole life. Your body already knows how to do this.",
      "Look around you right now. You're moving through your community — the streets, the people, the energy of this neighborhood. You're part of it. You belong here. Remember that.",
      "There's a kind of strength that doesn't look strong. It looks like showing up on a hard day. Like choosing yourself when everything in you wanted to stay still. That's what you're doing right now.",
      "Your pace is right. Not too fast, not too slow — wherever your body is today is exactly where it needs to be. Trust that. No performance required.",
      "If something in your chest feels heavy right now, that's okay. Let the movement carry a little of it. You don't have to be fixed to be moving forward.",
      "You were built to survive things that would break most people. And today, you're choosing healing instead of just surviving. That's the real move. That's the Unstoppable Season.",
      "Every person moving through these streets right now is carrying something. You are not alone in what you're holding. Not by a long shot.",
      "Check in with your body for a second. Not to judge it — just to feel it. Where are you carrying today? Shoulders? Jaw? Stomach? You don't have to fix it right now. Just notice it. Just say hello.",
      "You know what takes courage that nobody talks about? Staying soft in a world that keeps trying to harden you. Moving through your day without letting the weight close you down. That's you. Right now.",
      "There's no perfect way to take care of yourself. This — right here — is your way today. And it's enough. Let it be enough.",
      "Think about someone in your life who keeps going when things get hard. Chances are, that person looks a lot like what you look like right now.",
      "Your heart has been working for you this whole time — without you asking, without you thanking it. Beating through everything. Let yourself receive that for a second.",
      "The things that try to define you — the hard parts of where you come from, what you've been through — they don't get the final word. You do. And right now, the word you're choosing is to keep moving.",
      "Being gentle with yourself is not weakness. It's a learned skill. Most of us were never taught it. You're practicing it right now, even if it doesn't feel like it.",
      "Whatever you're working through — you don't have to solve it on this walk. Just let it be present without letting it take over. That's what this time is for.",
      "Healing isn't linear. Some days you take three steps forward and one back. Some days you just hold your ground. Holding your ground is still forward. Remember that.",
      "What you're doing right now is not small. Self-care in communities that never modeled it, wellness in spaces that weren't built for you — this is resistance. This is what unstoppable looks like.",
      "Your body is doing something remarkable right now. Every step, your heart pumps, your lungs work, your muscles fire — all without you having to ask. None of that required you to feel ready. It just required you to move.",
      // Late session (deeper, more reflective)
      "You've been out here a while now. You showed up and you stayed. That says everything about who you are — not who you think you should be. Who you actually are.",
      "Past the hard part. You might be feeling it now — the pace, the weight, the thoughts. Let them come. You're still moving. That's the answer.",
      "Notice how your breathing has settled. Your body found its rhythm without you having to force it. That's what it does when you trust it. Trust is the whole practice.",
      "Whatever you came out here with — it's been moving with you for a while now. Has it shifted at all? It doesn't have to. But sometimes movement does something to weight that standing still can't do.",
      "You've given yourself something real today. Time. Movement. This kind of quiet. Even if it doesn't feel like enough — it was something. And something matters.",
    ],
    midpoint: [
      "You're still moving. Your body has been showing up for you this whole time — heart beating, lungs breathing. Even when you felt like you couldn't. Take a quiet moment to acknowledge that.",
      "Sometimes healing looks quiet. It looks like a walk through the neighborhood. It looks like this — choosing to keep moving even when everything in you wanted to stay still.",
      "You are not a problem to be solved. You are a person who deserves care. Not because you've earned it. Not because you've been good enough. Just because you're here.",
      "Halfway through. Check in — what's changed since you started? Even a small shift is worth noticing. The walk is already doing its work.",
    ],
    closing: [
      "You stayed. That's the whole thing — you stayed with yourself through this. Bring that same energy into the rest of your day.",
      "Slow it down. Feel your feet on the ground. Feel this moment. You moved through something today — even if that something was just the day. That counts.",
      "End of this session. Whatever you're carrying, you've been carrying it with a little more grace today. That matters more than you know.",
      "You came out here. You stayed. You moved through something — and you're still here. Take what you found out here, and let it be the first thing you lead with today.",
    ],
  },
  es: {
    greeting: [
      "Toma una respiración antes de que nos movamos. No porque yo lo diga — sino porque viniste hoy, y eso merece un momento. Lo que sea que estés cargando ahora mismo, puedes soltarlo por estos minutos. Tu único trabajo es respirar y moverte.",
      "Llegaste. Eso importa más de lo que crees. Empieza despacio. Siente el pavimento bajo tus pies — eso es real, eso es ahora. Has sobrevivido el cien por ciento de tus días más difíciles. Este es solo uno más.",
      "Siente el suelo bajo tus pies ahora mismo. Eso es real. Eso es ahora. Lo que vino antes de este momento — que espere. Lo único que importa ahora es que estás aquí, respirando y moviéndote.",
      "Te presentaste. A ti mismo, a tu comunidad, a este momento. Hay un tipo de fortaleza en eso que no siempre tiene nombre. Empieza despacio. Siente tu cuerpo.",
      "Antes de que nos movamos — tómate un segundo para simplemente estar aquí. Sobreviviste todo lo que trató de mantenerte alejado de este momento. Y aún así, elegiste salir hoy.",
    ],
    moving: [
      "Observa tu respiración — no para controlarla, solo para sentirla. Has respirado a través de cosas difíciles toda tu vida. Tu cuerpo ya sabe cómo hacer esto.",
      "Mira a tu alrededor ahora mismo. Te estás moviendo por tu comunidad — las calles, la gente, la energía de este vecindario. Formas parte de ello. Perteneces aquí.",
      "Hay un tipo de fortaleza que no se ve fuerte. Se ve como presentarse en un día difícil. Como elegirte a ti mismo cuando todo en ti quería quedarse quieto.",
      "Tu ritmo está bien. Donde tu cuerpo está hoy es exactamente donde necesita estar. Confía en eso.",
      "Si algo en tu pecho se siente pesado ahora mismo, está bien. Deja que el movimiento lleve un poco de eso. No tienes que estar arreglado para seguir adelante.",
      "Fuiste hecho para sobrevivir cosas que romperían a la mayoría. Y hoy estás eligiendo sanar en lugar de solo sobrevivir. Esa es la verdadera temporada imparable.",
      "Cada persona que se mueve por estas calles ahora está cargando algo. No estás solo en lo que estás sosteniendo.",
      "Revisa tu cuerpo por un segundo. No para juzgarlo — solo para sentirlo. ¿Dónde estás cargando el día de hoy? No tienes que arreglarlo ahora. Solo nota.",
      "Lo que estás haciendo ahora mismo no es pequeño. El autocuidado en comunidades que nunca lo modelaron — esto es resistencia. Esto es imparable.",
      "Sanar no es lineal. Algunos días avanzas tres pasos y retrocedes uno. Algunos días solo mantienes tu terreno. Mantener tu terreno sigue siendo avanzar.",
    ],
    midpoint: [
      "Sigues moviéndote. Tu cuerpo ha estado apareciendo por ti todo este tiempo — corazón latiendo, pulmones respirando. Incluso cuando sentiste que no podías.",
      "A veces sanar se ve tranquilo. Se ve como una caminata por el vecindario. Se ve como esto — elegir seguir moviéndote.",
      "No eres un problema a resolver. Eres una persona que merece cuidado. No porque te lo hayas ganado. Solo porque estás aquí.",
      "A la mitad. Verifica — ¿qué cambió desde que empezaste? Incluso un pequeño cambio vale la pena notar.",
    ],
    closing: [
      "Te quedaste. Eso es todo — te quedaste contigo mismo durante esto. Lleva esa energía contigo el resto del día.",
      "Disminuye la velocidad. Siente tus pies en el suelo. Siente este momento. Lo lograste.",
      "Fin de esta sesión. Lo que sea que estés cargando, lo has llevado con un poco más de gracia hoy.",
      "Viniste aquí. Te quedaste. Te moviste a través de algo. Lleva lo que encontraste aquí y deja que sea lo primero con lo que lideres hoy.",
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// HYPE — Activation, momentum, culturally grounded LA energy.
// Voice: Staccato, punchy, commanding. Short bursts first.
// CBT: Behavioral activation, identity reinforcement, momentum.
// ─────────────────────────────────────────────────────────────
const HYPE_SCRIPTS = {
  en: {
    greeting: [
      "Let's go. No warm-up speech — your body already knows what time it is. This is the move, this is the day. You made it happen by showing up. Channel that. Let's build.",
      "You're here. That's step one. Now — pick up your pace. You didn't come out here to coast. You came out here to remind yourself what you're actually capable of. Let's go.",
      "LA sharpened you. Fast. Adaptable. Built for whatever comes. That's not a slogan — that's who you are. Now use it. Move like you mean it.",
      "Listen. Most people stayed comfortable today. You chose movement. That decision is already the difference between you and where you were yesterday. Don't waste it. Push.",
      "Say it to yourself before the first step: I am unstoppable. Mean it. Now prove it — one block, one breath, one decision at a time. Let's go.",
    ],
    moving: [
      // Early session — punchy, staccato
      "This right here — this pace, this breath, this decision — this is you building something. Block by block. Day by day.",
      "You didn't come from nothing. You came from people who built something from nothing. That's in you. Use it today.",
      "Every step is a rep. You're training your mind as much as your body. What's the thought you came in with? Leave it a few blocks back.",
      "When this feels hard — that's the signal. Not to stop. To switch gears. You know how to switch gears. Do it.",
      "Notice your rhythm. Feel it. You're moving through your community right now. Every block you cover is yours.",
      "Momentum is everything. Don't let a slow moment become a stopped moment. Keep going. No negotiations.",
      "You are unstoppable. Not because life has been easy. Because you're still here and still moving. Say it.",
      "Your body is telling you something right now — not that you can't do this. It's telling you that you are doing this. Feel the difference.",
      "Other people are sitting still right now. You chose movement. Remember that when everything else feels like it's standing still.",
      "Head up. Shoulders back. You move like someone who belongs here — because you do. Command the space.",
      "You know what separates people who change their lives from people who don't? Not talent. Not luck. The decision to move when everything in them wanted to stay comfortable.",
      "Push a little. Not to the edge — just past the comfort zone. That's where everything you want is actually built.",
      "Your ancestors didn't move halfway. They moved all the way. You carry that. Use it.",
      "Every time you want to quit — and you don't — you're teaching your brain something. You're programming the response. Don't skip the lesson today.",
      "Fast doesn't mean rushed. Focused doesn't mean stressed. Lock into your power pace — the one that feels like you can do this all day.",
      "Look at where your feet are. This block. This street. This community. You're claiming this space just by being in it. Keep claiming it.",
      "Hype yourself. Out loud or inside — it doesn't matter. Champions coach themselves. What do you need to hear right now?",
      "This is what discipline looks like. Not perfect. Not easy. Just consistent. You're being consistent right now. That's the game.",
      // Late session — dig deeper
      "You've been at this a while. Your body adapted. Breath found its rhythm. Now it's just you and the decision to finish strong.",
      "Past the hard part. Now momentum is carrying you. Lean into it. Don't let up now — not when you're this close.",
      "The last stretch is where most people pull back. You're not most people. You're still here. You're still moving. Finish.",
      "Every great thing you'll build starts with moments exactly like this one — you showing up when it would've been easier not to.",
      "You've been at this long enough that it's getting real. This is where character actually shows up. Show yours.",
    ],
    midpoint: [
      "More than halfway. Your body said yes when your mind wanted to negotiate. Listen to your body — it's smarter than the doubt.",
      "Past the midpoint. You showed up. You stayed. Now finish the way you started — on purpose.",
      "Halfway mark. You built momentum and you kept it. That's not easy. Most people don't make it here. You did.",
      "Check in — how are you doing? Not physically. Mentally. You still locked in? Good. Keep going.",
    ],
    closing: [
      "That's how it's done. Show up, do the work, carry it with you. Don't let this energy disappear the second you stop moving — use it today.",
      "You just did something your future self needed. Remember that the next time the excuse shows up.",
      "Done. Take that same energy into everything else today. You've built something today — protect it.",
      "Session complete. You moved your body, your mind, your momentum. Don't you dare walk away acting like it didn't matter. It mattered. You matter. Now go build.",
    ],
  },
  es: {
    greeting: [
      "Vamos. Sin discurso de calentamiento — tu cuerpo ya sabe qué hora es. Este es el movimiento, este es el día. Lo hiciste realidad al presentarte. Canaliza eso. Construyamos.",
      "Estás aquí. Ese es el paso uno. Ahora — aumenta tu ritmo. No viniste aquí a ir tranquilo. Viniste aquí a recordarte de lo que eres capaz.",
      "LA te afiló. Rápido. Adaptable. Hecho para lo que sea que venga. Eso no es un eslogan — eso es quién eres. Ahora úsalo.",
      "La mayoría de las personas se quedaron cómodas hoy. Tú elegiste el movimiento. Esa decisión ya es la diferencia.",
      "Dítelo antes del primer paso: soy imparable. Dilo en serio. Ahora demuéstralo — un bloque, una respiración, una decisión a la vez.",
    ],
    moving: [
      "Esto aquí — este ritmo, esta respiración, esta decisión — esto eres tú construyendo algo. Bloque por bloque. Día a día.",
      "No viniste de la nada. Viniste de personas que construyeron algo de la nada. Eso está en ti. Úsalo hoy.",
      "Cada paso es una repetición. Estás entrenando tu mente tanto como tu cuerpo.",
      "Cuando esto se siente difícil — esa es la señal. No para parar. Para cambiar de marcha. Tú sabes cómo. Hazlo.",
      "Nota tu ritmo. Siéntelo. Estás moviéndote por tu comunidad ahora mismo.",
      "El impulso lo es todo. No dejes que un momento lento se convierta en un momento detenido. Sigue.",
      "Eres imparable. No porque la vida haya sido fácil. Porque todavía estás aquí y todavía te mueves.",
      "Cabeza arriba. Hombros hacia atrás. Te mueves como alguien que pertenece aquí — porque perteneces.",
      "La consistencia es el juego completo. Hoy estás siendo consistente. Eso es todo lo que necesitas.",
      "El último tramo es donde la mayoría de las personas se retiran. Tú no eres la mayoría de las personas.",
    ],
    midpoint: [
      "Más de la mitad. Tu cuerpo dijo sí cuando tu mente quería negociar. Escucha a tu cuerpo.",
      "Más allá del punto medio. Te presentaste. Te quedaste. Ahora termina como empezaste — con intención.",
      "A la mitad. Construiste impulso y lo mantuviste. La mayoría no llega aquí. Tú llegaste.",
      "Verifica — ¿sigues concentrado? Bien. Sigue.",
    ],
    closing: [
      "Así es como se hace. Preséntate, haz el trabajo, llévalo contigo. No dejes que esta energía desaparezca.",
      "Acabas de hacer algo que tu futuro yo necesitaba. Recuerda eso la próxima vez que aparezca la excusa.",
      "Hecho. Lleva esa misma energía a todo lo demás hoy.",
      "Sesión completa. Moviste tu cuerpo, tu mente, tu impulso. Eso importó. Tú importas. Ahora ve a construir.",
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// BREAKTHROUGH — Insight, pattern interruption, reframing.
// Voice: Resonant, questioning, emotionally intelligent.
// CBT: Cognitive restructuring, schema challenges, insight.
// ─────────────────────────────────────────────────────────────
const BREAKTHROUGH_SCRIPTS = {
  en: {
    greeting: [
      "Before we start moving — what's the story you've been telling yourself this week? Not the facts. The story. Hold it. Don't try to fix it yet. Just walk with it. We're going to move through it today.",
      "Clarity doesn't always arrive sitting still. Sometimes it comes mid-stride — when you stop forcing it and start listening. Let's move. And let's pay attention to what shows up in the quiet between steps.",
      "You came here with something on your mind. Good. Don't try to fix it right now — just bring it with you. Walk, breathe, notice. The answers usually come when you stop chasing them.",
      "Every feeling you have right now is information. Not a problem. Not a diagnosis. Information. We're going to use this walk to decode some of it. Let's go.",
      "The breakthrough you're looking for doesn't come in a straight line. It comes in a walk like this one — when you get out of your own head long enough for something true to surface. Let's give it space.",
    ],
    moving: [
      // Cognitive reframes and questioning — resonant, not harsh
      "The thought you came in with — is it actually true? Or is it a thought that's been around so long it started to feel like a fact?",
      "Notice what you're holding in your body right now. Tight shoulders, clenched jaw — that's a message. What is it telling you?",
      "Look at the street around you. You're moving through your community. Sometimes a change in perspective starts with a change in location. What looks different from here?",
      "What would change if you stopped seeing this as a problem to solve and started seeing it as information to understand?",
      "The thing you keep avoiding thinking about — what's one true thing you know about it that you've been pretending you don't?",
      "Most of the weight you carry isn't yours to carry alone. Some of it was handed to you before you were old enough to refuse it. You're allowed to put that part down.",
      "You've been in this situation before — different details, same feeling. What did that version of you figure out that this version hasn't remembered yet?",
      "What's the story you tell about yourself when things go wrong? Where did you learn it? And is it still serving you?",
      "Pay attention to your pace right now. Is it rushed? Hesitant? That pace is often a mirror of what's going on inside. What is it mirroring?",
      "What's the thing you want most right now — and what's the belief that's making you think you can't have it?",
      "Consider: what would the person you are becoming do with what you're facing right now? Not who you've been. Who you're becoming.",
      "What are you protecting by staying stuck? There's always something. It's not weakness to ask — it's information. What's the answer for you?",
      "You know more than you're acting like you know. What's the thing you already understand that you keep waiting for someone else to confirm?",
      "The feeling you've been running from — what happens if you just turn and face it for a second? Not to fix it. Just to look at it.",
      "Where in your life have you been waiting for permission? Whose permission? And do they actually have the authority to give it?",
      "Most resistance is just information in disguise. What are you resisting right now — and what is the resistance actually telling you?",
      "What pattern keeps showing up in your life? In relationships, in work, in how you respond to pressure. You didn't create it randomly. What's its origin?",
      "The breakthrough doesn't always feel like one. Sometimes it just feels like a thought you had on a walk that you almost didn't take.",
      // Late session — deeper, more integrative
      "You've been out here a while. Has anything shifted? It doesn't have to be dramatic. Even a slight change in how something feels — that's a shift worth noticing.",
      "What's one belief you walked in with today that you're willing to question on the way back?",
      "Sometimes clarity doesn't arrive as an answer. It arrives as a different question. What's a better question you could be asking yourself right now?",
      "The thing you're carrying right now — what would it mean to actually trust yourself with it? Not manage it. Trust yourself with it.",
      "You're closer to the end of this session now. What's one thing you see that you couldn't see clearly when you started?",
    ],
    midpoint: [
      "Pause on this — what's one belief you have about yourself that you'd be better off without? You don't have to replace it. Just name it.",
      "What if the hardest thing happening in your life right now is also the thing teaching you the most? What's the lesson you keep resisting?",
      "Halfway through. The walk is already doing its work — sometimes before you notice it. What's shifted even a little since you started?",
      "You've been walking with this thing for a while now. How does it feel to carry it in motion versus standing still with it? Notice the difference.",
    ],
    closing: [
      "Take something back with you. Not a decision, not a plan — just one true thing you saw more clearly today. That's the whole point.",
      "Breakthrough doesn't always feel like a lightning bolt. Sometimes it's a quiet shift. Pay attention to any quiet shifts today. Don't rush past them.",
      "You don't have to figure everything out today. But you're one walk closer to clarity. That's real. Hold it.",
      "Session done. The walk is over, but the thinking isn't. Let what started out here continue in the quiet today. Give what shifted a few minutes to land before you return to the noise.",
    ],
  },
  es: {
    greeting: [
      "Antes de que nos movamos — ¿cuál es la historia que te has estado contando esta semana? No los hechos. La historia. Sostenla. No intentes arreglarla todavía. Solo camina con ella.",
      "La claridad no siempre llega cuando estás quieto. A veces viene a medio paso — cuando dejas de forzarla y empiezas a escuchar. Vamos a movernos. Y prestemos atención a lo que aparece.",
      "Viniste aquí con algo en mente. Bien. No intentes arreglarlo ahora mismo — solo tráelo contigo. Camina, respira, nota. Las respuestas suelen llegar cuando dejas de perseguirlas.",
      "Cada sentimiento que tienes ahora mismo es información. No un problema. No un diagnóstico. Información. Vamos a usar esta caminata para decodificar algo de ella.",
      "El avance que estás buscando no llega en línea recta. Llega en una caminata como esta — cuando sales de tu propia cabeza el tiempo suficiente para que algo verdadero aflore.",
    ],
    moving: [
      "El pensamiento con el que llegaste — ¿es realmente verdad? ¿O es un pensamiento que ha estado tanto tiempo que empezó a sentirse como un hecho?",
      "Nota lo que estás sosteniendo en tu cuerpo ahora mismo. Hombros tensos, mandíbula apretada — ese es un mensaje. ¿Qué te está diciendo?",
      "Mira la calle a tu alrededor. Te estás moviendo por tu comunidad. A veces un cambio de perspectiva comienza con un cambio de lugar.",
      "¿Qué cambiaría si dejaras de ver esto como un problema a resolver y empezaras a verlo como información para entender?",
      "Lo que sigues evitando pensar — ¿cuál es una cosa verdadera que sabes sobre eso que has estado fingiendo que no sabes?",
      "La mayor parte del peso que cargas no es tuyo para cargarlo solo. Algo te fue entregado antes de que pudieras rechazarlo. Se te permite poner esa parte en el suelo.",
      "Has estado en esta situación antes — detalles diferentes, mismo sentimiento. ¿Qué descubrió esa versión de ti que esta versión aún no ha recordado?",
      "¿Cuál es la historia que te cuentas sobre ti mismo cuando las cosas salen mal? ¿Dónde la aprendiste? ¿Y todavía te sirve?",
      "¿Qué estarías protegiendo si te quedas estancado? Siempre hay algo. No es debilidad preguntar — es información.",
      "La mayoría de la resistencia es solo información disfrazada. ¿Qué estás resistiendo ahora mismo — y qué te está diciendo esa resistencia?",
    ],
    midpoint: [
      "Detente en esto — ¿cuál es una creencia que tienes sobre ti mismo de la que estarías mejor sin ella? No tienes que reemplazarla. Solo nómbrala.",
      "¿Y si la cosa más difícil que está pasando en tu vida ahora mismo también es la que más te está enseñando? ¿Cuál es la lección que sigues resistiendo?",
      "A la mitad. La caminata ya está haciendo su trabajo — a veces antes de que lo notes. ¿Qué ha cambiado aunque sea un poco desde que empezaste?",
      "Has estado caminando con esta cosa por un tiempo. ¿Cómo se siente cargarla en movimiento versus estar quieto con ella?",
    ],
    closing: [
      "Llévate algo contigo. No una decisión, no un plan — solo una cosa verdadera que viste con más claridad hoy.",
      "El avance no siempre se siente como un relámpago. A veces es un cambio silencioso. Presta atención a cualquier cambio silencioso hoy.",
      "No tienes que resolverlo todo hoy. Pero estás una caminata más cerca de la claridad.",
      "Sesión terminada. Deja que lo que comenzó aquí continúe en la quietud. Da a lo que cambió unos minutos para aterrizar antes de volver al ruido.",
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// STRATEGY — Structured direction, CBT-adjacent, practical.
// Voice: Measured, composed, calm and certain.
// CBT: Problem-solving, thought records, behavioral planning.
// ─────────────────────────────────────────────────────────────
const STRATEGY_SCRIPTS = {
  en: {
    greeting: [
      "Before we start — name the actual problem. Not the feeling around it. The specific problem. Hold it. We're going to think through it while we move, and by the end of this session you're walking away with at least one next step. Let's go.",
      "You're a problem-solver. That's how you're wired. Today, let's use it. What's the one thing that, if it changed, would change everything else right now? Hold that thought. Let's think.",
      "Your mind works better when your body moves. That's not motivation — that's how the brain functions. So we're going to put both to work today. The walk for the body, the thinking for everything else. Let's start.",
      "Clear head starts now. You've got decisions to make, things to figure out. This walk is the place to do it — not later, not tomorrow. Now. Let's build the clarity.",
      "One problem at a time. That's the whole strategy for today. Pick the one that matters most — not the loudest one, the most important one. Got it? Let's move.",
    ],
    moving: [
      // Structured, action-oriented, CBT prompts
      "For whatever you're working through — what's actually in your control right now? Not eventually. Right now. Start there.",
      "Separate what's urgent from what's important. Most of what feels urgent isn't. What's actually important right now?",
      "What's one decision you've been avoiding? Not because you don't know the answer — but because the answer is uncomfortable. Name it.",
      "Your energy is a resource. Where are you spending it on things that aren't moving the needle? What would you stop if you were thinking clearly?",
      "Notice the streets around you. You're moving through your community — the same one you're trying to show up for. You can't show up for anyone if you're running empty.",
      "What does the next right step look like — not the whole solution, just the next right step? That's the only thing you actually have to figure out today.",
      "Think about the thing that's been draining your energy most. Is that drain producing anything? Or is it just costing you?",
      "What are you tolerating right now that you know you shouldn't be? Not every problem deserves patience. Some deserve a decision.",
      "What would you advise someone you love to do in your exact situation? That's usually the clearest version of the answer. Take your own counsel.",
      "Define the win for today. Not the year. Not the quarter. Just today. What does 'good' look like at the end of today? Make it specific.",
      "What's one relationship, commitment, or habit that's not working anymore but you haven't let yourself say out loud? Say it. At least to yourself.",
      "There's usually one bottleneck — one thing that, if it moved, would free up everything else. Have you named yours? What is it?",
      "Clarity requires subtraction. What are you doing right now that you need to stop doing to make room for what actually matters?",
      "What's one assumption you're operating on right now that hasn't been verified? Is it actually true — or have you just been treating it like it is?",
      "Your attention is your most valuable resource. Where is it going that hasn't earned it? Where does it actually need to go?",
      "Systems beat willpower every time. What's one small structure — a routine, a trigger, a commitment — that would make the right thing easier to do automatically?",
      "What's the conversation you've been avoiding that you know you need to have? Not all problems have conversations, but this one probably does. What's stopping you?",
      "Think about where you want to be in ninety days. What's one commitment you'd have to make right now to get there? Can you make it?",
      // Late session — integrative, forward-facing
      "You're past the midpoint. Check your thinking — has the problem gotten any clearer? What do you know now that you didn't when you started?",
      "The decision you've been circling — you probably know the answer. The issue is usually execution, not understanding. What does execution actually require from you?",
      "What's worked before in a situation like this? You have a track record of solving hard things. What did that look like?",
      "What you keep thinking about on a walk is usually the thing that most needs your attention. Whatever kept surfacing out here — that's the signal.",
      "You've been thinking through this for the whole session. By now you know more than you're giving yourself credit for. Trust what emerged.",
    ],
    midpoint: [
      "Check in — is the problem still looking the same as when you started? Sometimes movement changes the angle. What do you see now that you didn't see before?",
      "Past the midpoint. What's the most important thing you've realized so far? Name it specifically. That's the thing to build from.",
      "Halfway through. You've been thinking while moving. That's a different quality of thought than sitting still. What did that difference surface for you?",
      "Energy check — how are you managing yours right now? Not physically. In life. What do you need to protect it this week?",
    ],
    closing: [
      "Leave this session with one action. One specific thing you'll do differently based on what you thought through today. Not a theme. An action.",
      "Clarity is a practice. You just practiced it. Use what you figured out — don't let the insight expire in the parking lot.",
      "You didn't solve everything today — but you moved toward it. That's exactly how it works. One walk, one insight, one step.",
      "Session done. You came here with a problem and you worked it. The work doesn't stop — but now you have more clarity than you had at the start. One action. Today.",
    ],
  },
  es: {
    greeting: [
      "Antes de comenzar — nombra el problema real. No el sentimiento alrededor de él. El problema específico. Sostenlo. Vamos a pensar en eso mientras nos movemos, y al final de esta sesión te vas con al menos un próximo paso.",
      "Eres un solucionador de problemas. Así estás configurado. Hoy, usémoslo. ¿Cuál es la única cosa que, si cambiara, cambiaría todo lo demás ahora mismo?",
      "Tu mente funciona mejor cuando tu cuerpo se mueve. Eso no es motivación — así funciona el cerebro. Vamos a poner ambos a trabajar hoy.",
      "Cabeza clara empieza ahora. Tienes decisiones que tomar, cosas que resolver. Esta caminata es el lugar para hacerlo — no después, no mañana. Ahora.",
      "Un problema a la vez. Esa es toda la estrategia para hoy. Elige el que más importa — no el más ruidoso, el más importante.",
    ],
    moving: [
      "Para lo que estás trabajando — ¿qué está realmente en tu control ahora mismo? No eventualmente. Ahora mismo. Empieza por ahí.",
      "Separa lo que es urgente de lo que es importante. La mayoría de lo que se siente urgente no lo es. ¿Qué es realmente importante ahora mismo?",
      "¿Cuál es una decisión que has estado evitando? No porque no sepas la respuesta — sino porque la respuesta es incómoda. Nómbrala.",
      "Tu energía es un recurso. ¿Dónde la estás gastando en cosas que no mueven la aguja? ¿Qué pararías si estuvieras pensando con claridad?",
      "Nota las calles a tu alrededor. Te estás moviendo por tu comunidad — la misma por la que intentas aparecer. No puedes aparecer por nadie si estás vacío.",
      "¿Cuál es el siguiente paso correcto — no toda la solución, solo el siguiente paso correcto? Eso es lo único que tienes que descubrir hoy.",
      "¿Qué has estado tolerando que sabes que no deberías? No todo problema merece paciencia. Algunos merecen una decisión.",
      "¿Qué le aconsejarías a alguien que amas en tu situación exacta? Esa es generalmente la versión más clara de la respuesta.",
      "Por lo general hay un cuello de botella — una cosa que, si se moviera, liberaría todo lo demás. ¿Has nombrado el tuyo?",
      "La claridad requiere sustracción. ¿Qué estás haciendo ahora mismo que necesitas dejar de hacer para dar espacio a lo que realmente importa?",
    ],
    midpoint: [
      "Verifica — ¿el problema todavía se ve igual que cuando empezaste? A veces el movimiento cambia el ángulo. ¿Qué ves ahora que no veías antes?",
      "Más allá del punto medio. ¿Cuál es la cosa más importante que te has dado cuenta hasta ahora? Nómbrala específicamente.",
      "A la mitad. Has estado pensando mientras te mueves. ¿Qué afloró esa diferencia para ti?",
      "Control de energía — ¿cómo la estás administrando ahora mismo? No físicamente. En la vida. ¿Qué necesitas protegerla esta semana?",
    ],
    closing: [
      "Sal de esta sesión con una acción. Una cosa específica que harás diferente basada en lo que pensaste hoy.",
      "La claridad es una práctica. Acabas de practicarla. Usa lo que descubriste.",
      "No resolviste todo hoy — pero te moviste hacia ello. Así es exactamente como funciona.",
      "Sesión terminada. Llegaste aquí con un problema y lo trabajaste. Ahora tienes más claridad de la que tenías al comenzar. Una acción. Hoy.",
    ],
  },
};

// ── JOURNAL PROMPTS ──────────────────────────────────────────
const JOURNAL_PROMPTS = {
  en: [
    "What's a story you've been telling yourself that might be keeping you stuck?",
    "What are you outgrowing right now — and what's making it hard to let go?",
    "When did you last feel genuinely proud of yourself, and what made it feel different than usual?",
    "What's something you know you need to do that you've been avoiding — and what's the actual reason?",
    "Describe one moment from the last week where you handled something better than you expected.",
    "What would you tell someone you love who was facing exactly what you're facing right now?",
    "What does 'being okay' look like for you — not perfect, just okay?",
    "What's one thing that feels heavy right now, and what would it mean to put it down, even temporarily?",
    "Who in your life makes you feel most like yourself? What is it about them?",
    "What's one belief about yourself you received from someone else that you haven't actually decided you agree with?",
    "If the version of you from five years ago could see where you are now, what would they be surprised by?",
    "What does your body need right now that your mind keeps arguing with?",
    "What's one thing you've been pretending is fine when it isn't? What would it mean to stop pretending?",
    "What would it feel like to trust yourself completely — about one specific thing in your life right now?",
    "What does unstoppable mean to you, in the context of your actual life — not a slogan, the real thing?",
  ],
  es: [
    "¿Qué historia te estás contando que podría mantenerte estancado?",
    "¿Qué estás superando ahora mismo — y qué hace que sea difícil dejarlo ir?",
    "¿Cuándo fue la última vez que te sentiste genuinamente orgulloso de ti mismo?",
    "¿Qué es algo que sabes que necesitas hacer y que has estado evitando — y cuál es la razón real?",
    "Describe un momento de la última semana en el que manejaste algo mejor de lo que esperabas.",
    "¿Qué le dirías a alguien que amas que estuviera enfrentando exactamente lo que tú enfrentas ahora?",
    "¿Qué significa 'estar bien' para ti — no perfecto, solo bien?",
    "¿Qué es algo que se siente pesado ahora mismo, y qué significaría soltarlo?",
    "¿Quién en tu vida te hace sentir más como tú mismo? ¿Qué tiene esa persona?",
    "¿Cuál es una creencia sobre ti mismo que recibiste de alguien más y con la que en realidad no has decidido si estás de acuerdo?",
  ],
};

// ── AFFIRMATIONS ─────────────────────────────────────────────
const AFFIRMATIONS = {
  en: [
    "You are unstoppable — not despite what you've been through, but because of it.",
    "You showed up today. That takes more courage than most people know.",
    "Your presence is your power.",
    "You belong here. You matter. Full stop.",
    "Every step forward is proof of what you're capable of.",
    "You were built for this moment.",
    "Showing up for yourself is the most powerful thing you can do.",
    "You are not alone in this — your community is with you.",
    "The fact that you're still here is the whole victory.",
    "You carry more strength than you give yourself credit for.",
    "Your resilience is not a small thing. It is everything.",
    "Taking action — even one small step — changes everything.",
    "You don't have to feel ready to be unstoppable. You already are.",
    "What you do for yourself, you do for everyone around you.",
    "You have survived every hard day so far. That record holds.",
  ],
  es: [
    "Eres imparable — no a pesar de lo que has pasado, sino por ello.",
    "Te presentaste hoy. Eso requiere más valentía de lo que la mayoría sabe.",
    "Tu presencia es tu poder.",
    "Perteneces aquí. Tú importas.",
    "Cada paso adelante es prueba de lo que eres capaz.",
    "Fuiste hecho para este momento.",
    "Presentarte por ti mismo es lo más poderoso que puedes hacer.",
    "No estás solo en esto — tu comunidad está contigo.",
    "El hecho de que aún estés aquí es la victoria completa.",
    "Llevas más fortaleza de la que te das crédito.",
    "Tu resiliencia no es poca cosa. Lo es todo.",
    "Tomar acción — incluso un pequeño paso — cambia todo.",
  ],
};

// ── MEDITATION ───────────────────────────────────────────────
const MEDITATION_SCRIPTS = {
  en: [
    `Close your eyes if you can. Feel the weight of your body — the ground holding you. You don't have to hold yourself up right now. Let it do that.

Take a breath in through your nose — slow and full. Hold it at the top. Now let it go through your mouth. Let the exhale be longer than the inhale.

You are here. Not where you were this morning. Not where you'll be tonight. Here. This room. This breath. This moment.

Notice any place in your body where you're holding tension. You don't have to fix it — just acknowledge it. Say: I see you. And then breathe into it.

You arrived today. Whatever it took to get here — it was enough.`,

    `Sit with your feet flat on the ground if you can. Feel where your body meets the floor — that contact is real. Something you can trust right now.

Breathe naturally — don't force it. Just observe the rhythm your body already knows.

Let your thoughts come. Don't chase them and don't push them away. They're just thoughts — not facts, not commands. Watch them pass.

On your next inhale, breathe in the word: present. On the exhale, release: future. Present. Future. Three times.

You don't need to solve anything right now. This moment has one job — to be exactly what it is.`,

    `Place one hand on your chest. Feel it rise and fall. That rhythm has been with you your whole life — through every hard day, every loss, every moment you thought you wouldn't make it. And here you are.

Take a slow breath in. And a slower breath out.

What you're feeling right now is allowed. All of it. You don't have to perform calm. You don't have to feel ready. You just have to be here.

And right now, here is enough.`,
  ],
  es: [
    `Cierra los ojos si puedes. Siente el peso de tu cuerpo — el suelo sosteniéndote. No tienes que sostenerte ahora mismo.

Toma una respiración por la nariz — lenta y profunda. Mantenla en la cima. Ahora suéltala por la boca. Deja que la exhalación sea más larga que la inhalación.

Estás aquí. No donde estabas esta mañana. No donde estarás esta noche. Aquí. Este lugar. Esta respiración. Este momento.

Llegaste hoy. Lo que sea que tomó para llegar aquí — fue suficiente.`,

    `Pon una mano en tu pecho. Siente cómo sube y baja. Ese ritmo ha estado contigo toda tu vida — a través de cada día difícil, cada pérdida. Y aquí estás.

Respira lentamente. Y suelta más despacio aún.

Lo que sientes ahora mismo está permitido. Todo. No tienes que actuar con calma. Solo tienes que estar aquí. Y ahora mismo, aquí es suficiente.`,
  ],
};

// ─────────────────────────────────────────────────────────────
// NARRATIVE BUILDER
// Phase-aware: greeting → early → midpoint → late → closing
// Weather/time woven into greeting AND mid-session segments.
// Sponsor line appended to the first moving segment.
// ─────────────────────────────────────────────────────────────

const buildLocalNarrative = (params: {
  mode: EchoPersona;
  lang: Language;
  isIntro: boolean;
  segmentNumber?: number;
  timeOfDay: string;
  weatherCondition?: string;
  temperature?: number;
  airQualityIndex?: number;
  targetThought?: string;
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
  const greetWeather = WEATHER_GREET[l];
  const midWeather   = WEATHER_MID[l];
  const mins = params.sessionMinutes ?? 0;
  const seg  = params.segmentNumber ?? 1;

  // ── GREETING ──────────────────────────────────────────────
  if (params.isIntro) {
    let prefix = '';
    if (params.temperature !== undefined && params.temperature > 30)
      prefix = pick(greetWeather.hot) + ' ';
    else if (params.airQualityIndex !== undefined && params.airQualityIndex > 100)
      prefix = pick(greetWeather.smoggy) + ' ';
    else if (params.temperature !== undefined && params.temperature < 18)
      prefix = pick(greetWeather.cool) + ' ';
    else if (params.weatherCondition?.toLowerCase().includes('cloud') || params.weatherCondition?.toLowerCase().includes('overcast'))
      prefix = pick(greetWeather.cloudy) + ' ';
    else if (params.timeOfDay === 'morning')
      prefix = pick(greetWeather.morning) + ' ';
    else if (params.timeOfDay === 'evening')
      prefix = pick(greetWeather.evening) + ' ';
    else if (params.timeOfDay === 'afternoon' && greetWeather.afternoon?.length)
      prefix = pick(greetWeather.afternoon) + ' ';
    return prefix + pick(scripts.greeting);
  }

  // ── CLOSING (55+ min) ─────────────────────────────────────
  if (mins >= 55) {
    return pick(scripts.closing);
  }

  // ── MIDPOINT (20–45 min) ──────────────────────────────────
  if (mins >= 20 && mins < 45 && scripts.midpoint?.length) {
    // 50% chance to use midpoint script vs. continuing with moving
    if (Math.random() < 0.5) return pick(scripts.midpoint);
  }

  // ── WEATHER INSERT (mid-session, after min 15) ────────────
  let weatherInsert = '';
  if (mins > 15) {
    const rand = Math.random();
    if (params.temperature !== undefined && params.temperature > 30 && midWeather.hot?.length)
      weatherInsert = pick(midWeather.hot) + ' ';
    else if (params.airQualityIndex !== undefined && params.airQualityIndex > 100 && midWeather.smoggy?.length)
      weatherInsert = pick(midWeather.smoggy) + ' ';
    else if (params.temperature !== undefined && params.temperature < 18 && rand < 0.4 && midWeather.cool?.length)
      weatherInsert = pick(midWeather.cool) + ' ';
    else if (params.timeOfDay === 'morning' && rand < 0.25 && midWeather.morning?.length)
      weatherInsert = pick(midWeather.morning) + ' ';
    else if (params.timeOfDay === 'evening' && rand < 0.35 && midWeather.evening?.length)
      weatherInsert = pick(midWeather.evening) + ' ';
  }

  // ── SPONSOR LINE (first moving segment only) ──────────────
  if (seg === 1) {
    const sponsorLine = pick(SPONSOR_LINES[l]);
    return pick(scripts.moving) + ' ' + sponsorLine;
  }

  // ── MOVING (main loop) ────────────────────────────────────
  return weatherInsert + pick(scripts.moving);
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
    return buildLocalNarrative({
      mode: params.mode,
      lang: params.lang,
      isIntro: params.isIntro,
      segmentNumber: params.segmentNumber,
      timeOfDay,
      weatherCondition: params.weatherCondition,
      temperature: params.temperature,
      airQualityIndex: params.airQualityIndex,
      targetThought: params.targetThought,
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
    const closing = scripts.closing?.length ? pick(scripts.closing) : '';
    const stats = l === 'es'
      ? `${dist} millas. ${mins} minutos. `
      : `${dist} miles. ${mins} minutes. `;
    return stats + closing;
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
