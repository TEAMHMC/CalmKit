
import { Language, EchoPersona, ActivityType } from "./types";

// Backend proxy, used when available; rich local library is always the fallback
const PROXY_URL = (typeof window !== 'undefined' && (window as any).CALMKIT_PROXY_URL)
  || 'https://volunteer.healthmatters.clinic/api/calmkit';

const proxyCall = async (endpoint: string, body: Record<string, any>): Promise<any> => {
  const controller = new AbortController();
  // 45s timeout — only catches truly dead servers. In practice the warm-up ping
  // on mount keeps Cloud Run hot, so cold-start delays don't reach the user.
  const timer = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(`${PROXY_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Proxy ${endpoint} failed: ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
};

// ─────────────────────────────────────────────────────────────
// LOCAL COACHING LIBRARY, UNSTOPPABLE SEASON 2026
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
    "This session is part of the Los Angeles County Department of Mental Health's Take Action LA campaign, in partnership with Health Matters Clinic. Three free wellness events in LA this May, MOVE, HEAL, TRANSFORM. Visit healthmatters.clinic.",
    "This walk is brought to you through the Los Angeles County Department of Mental Health's Take Action LA campaign, in partnership with Health Matters Clinic. Wellness like this is free and open to everyone.",
    "A note from your host, this moment is part of Unstoppable Season 2026, supported by the Los Angeles County Department of Mental Health's Take Action LA campaign and Health Matters Clinic. You belong here. healthmatters.clinic.",
  ],
  es: [
    "Esta sesión es parte de la campaña Take Action LA del Departamento de Salud Mental del Condado de Los Ángeles, en asociación con Health Matters Clinic. Tres eventos gratuitos en LA este mayo, MOVE, HEAL, TRANSFORM. Visita healthmatters.clinic.",
    "Esta caminata es presentada a través de la campaña Take Action LA del Departamento de Salud Mental del Condado de Los Ángeles, en asociación con Health Matters Clinic. El bienestar como este es gratuito para todos.",
  ],
};

// ── WEATHER, GREETING OPENERS ────────────────────────────────
// Prefix the greeting when conditions match.
const WEATHER_GREET = {
  en: {
    hot: [
      "It's warm out here, LA heat is real. Pace yourself. Stay hydrated. That heat isn't stopping you, take it as evidence of what you can handle.",
      "The city is running hot today. Respect it. Your pace matters more than your speed right now, moving steady through heat is still moving.",
    ],
    smoggy: [
      "Air quality is rough today, breathe through your nose, keep your breaths controlled. Your presence here still matters. Take care of your lungs while you do it.",
      "High smog day in LA. Short, deliberate breaths. Your community deserves clean air, and that fight is worth having. But right now, just take care of yourself.",
    ],
    cool: [
      "It's cool out here, that's a gift in LA. Your lungs open up in this. Let your breathing be full. Use it.",
      "Cool air and open streets. This is what it feels like when the city gives you something back. Take it.",
    ],
    cloudy: [
      "Overcast today, that LA marine layer is out. But notice: you still came out. The weather didn't get a vote in your decision. That says something.",
      "Gray skies don't mean a gray day. Some of the clearest thinking happens when the light is soft. Let's use it.",
    ],
    morning: [
      "Morning. The streets are yours right now. Before the day puts its demands on you, this time is yours first.",
      "You got up and came out. Before anyone else needed anything from you, you chose yourself. That's the right order.",
    ],
    afternoon: [
      "Afternoon out here, the day is already in motion around you. Now you're in motion too. Let's use this window.",
      "Midday. The city is loud and busy. You carved out time anyway. Use every minute of it.",
    ],
    evening: [
      "Evening. The city is starting to wind down. Let the movement help you transition, out of the day, into yourself.",
      "End of the day, and you still showed up. That's commitment. Now let this be the exhale your body has been waiting for.",
    ],
  },
  es: {
    hot: ["Hace calor, el calor de LA es real. Mantén tu ritmo. Que el calor no te detenga, tómalo como evidencia de lo que puedes manejar."],
    smoggy: ["La calidad del aire es mala hoy, respira por la nariz, mantén respiraciones controladas. Cuida tus pulmones."],
    cool: ["Está fresco hoy, eso es un regalo en LA. Tus pulmones se abren con esto. Deja que tu respiración sea profunda."],
    cloudy: ["Nublado hoy. Pero nota, aun así saliste. El clima no tuvo voto en tu decisión. Eso dice algo."],
    morning: ["Mañana. Las calles son tuyas ahora. Antes de que el día ponga sus demandas en ti, esto es tuyo primero."],
    afternoon: ["Mediodía. La ciudad está en pleno movimiento. Ahora tú también. Usa este tiempo."],
    evening: ["Tarde. La ciudad empieza a calmarse. Deja que el movimiento te ayude a salir del día y entrar en ti."],
  },
};

// ── WEATHER, MID-SESSION INSERTS ────────────────────────────
// Optionally prefixed to moving segments after minute 15.
const WEATHER_MID = {
  en: {
    hot: [
      "Still warm, listen to your body. Pace yourself. Staying in it matters more than the speed you do it at.",
      "Heat like this is information. Adapt and keep moving. There's more strength in pacing right than pushing wrong.",
    ],
    smoggy: [
      "Air's still rough out here, controlled breaths. Short and steady. Your community deserves better air than this. But today, take care of you.",
      "High smog day, moderate your effort. Your health is the goal, not the distance.",
    ],
    cool: [
      "Notice the air, still comfortable. Let your breathing be full. Your body is efficient right now. Trust it.",
      "Still cool out here. Use it. Your body is running well in this. Don't hold back.",
    ],
    morning: [
      "Still early. You're getting this done before the day has a chance to take it from you. Remember that.",
      "Morning sessions hit different. You're building the day before it builds you.",
    ],
    afternoon: [
      "Afternoon out here, the energy of the city is different at this hour. Work with what you have.",
      "Midday. The heat of the day and the heat of your effort, both real. Keep going.",
    ],
    evening: [
      "Evening now. The light is different. The pace of the city has shifted. Let your body match the rhythm of the hour.",
      "You're moving through the city at the end of its day. That quiet around you, let it work on you too.",
    ],
    cloudy: [
      "Marine layer's still out. No glare, softer light. Easier on the body than you think. Use it.",
    ],
  },
  es: {
    hot: ["Todavía hace calor, escucha a tu cuerpo. Hay más fortaleza en mantener el ritmo correcto que en empujar de manera incorrecta."],
    smoggy: ["Aire todavía difícil hoy, respiraciones cortas y controladas. Cuida tus pulmones."],
    cool: ["Todavía fresco. Deja que tu respiración sea profunda. Tu cuerpo está funcionando bien ahora. Confía en eso."],
    morning: ["Todavía temprano. Estás haciendo esto antes de que el día tenga la oportunidad de quitártelo."],
    evening: ["La ciudad está cambiando a su ritmo nocturno. Deja que tu cuerpo haga lo mismo."],
  },
};

// ─────────────────────────────────────────────────────────────
// HOPE, Positive reframing, abundance mindset, new season declarations.
// Voice: Warm, unwavering, declarative. Forward-facing, never dwelling.
// CBT: Positive reframing, future-self visualization, gratitude activation.
// ─────────────────────────────────────────────────────────────
const HOPE_SCRIPTS = {
  en: {
    greeting: [
      "I'm going to tell you something right now, you are blessed. Not because everything is going perfectly. Not because the hard things didn't happen. But because you showed up today. That's already favor. Now let's move.",
      "Before your first step, I want you to shake something off. Whatever doubt you walked in with, whatever voice said you weren't ready, shake it off. You are starting fresh right now. New moment. New decision. Let's go.",
      "You are not behind. You are not too late. You are not less than. Whatever comparison, whatever setback tried to define you, it doesn't get a vote today. Receive that before we take one step. Now let's walk.",
      "There's something powerful about showing up when you didn't have to. You could have stayed home. You could have waited for a better day. You didn't. That's the spirit of someone stepping into their next level. Let's move.",
      "This is going to be a great walk. I want you to hold that, not because you feel it yet, but because you're choosing to believe in where you're going. You are moving toward something better. Let's go prove it.",
    ],
    moving: [
      "Your steps are speaking right now. Every one of them is saying: I believe something better is ahead. That's not naive, that's the kind of thinking that changes outcomes. Keep moving.",
      "Shake off the thought that you're not enough. Not strong enough, not healed enough, not ready enough. You don't have to be finished to be moving. You just have to be moving. And you are.",
      "Look at where you are right now. A year ago, some of what you're carrying today didn't exist. And a year from now, you're going to be somewhere you can't fully see yet. Trust the direction you're walking.",
      "Your latter will be greater than your former. That's not a wish, that's a declaration. Let it settle while you move. The best of what you have is not behind you.",
      "You are favored. Not because you earned it perfectly today, because of who you are and what you're built for. Let that truth walk with you. Every step you take, you take it as someone already in the middle of their breakthrough.",
      "Don't let the size of what you're facing talk you out of the size of what's in you. What you carry on the inside is greater than what's in front of you. The evidence is coming. Keep moving.",
      "New levels require new thinking. If you're still running last season's thoughts, you can't step into this season's possibilities. With every step, you're practicing a new thought: I am built for what's next.",
      "There is something being built in you right now that you can't fully see yet. That's okay, builders don't always see the finished product from inside the construction. But you're building. Every step is building.",
      "You've been through some things. I know that. But here's what I also know: you came through them. Every one. Every hard thing you faced, you're standing on the other side of it. That's not luck. Walk that truth.",
      "Sometimes we get so focused on what we don't have that we forget to notice what we do. Take a breath and think of one thing going right, just one. That's not denial. That's the practice that opens the door to more.",
      "You are not the sum of your setbacks. You are the total of every time you got back up. And you got back up, again and again. This walk is one more time. Let it count.",
      "The story is not over. Whatever chapter you're in, the hard one, the confusing one, the tired one, you're still in the middle, not the end. The middle is where things change. Keep moving through it.",
      "Every step you're taking is a step away from what tried to hold you and toward what's waiting. You might not see what's waiting yet. But you're moving toward it. That direction matters more than the distance.",
      "Declare something good over yourself today. Not what you wish you were, what you are becoming. Say it in your spirit: I am getting stronger. I am making progress. I am moving toward my purpose. Let those words walk with you.",
      "What if this walk is part of how the next chapter begins? Not after the walk. Right now, you moving, you breathing, you choosing yourself, this is the beginning. You're already in it.",
      "You didn't come this far just to stop here. Everything that got you to this point, the hard seasons, the setbacks, the slow starts, it was all moving you forward, not backward. You're still in forward motion.",
      "I want you to think about one thing you're grateful for that you usually rush past. The morning. Your legs working. The fact that you're out here. Take a real moment with it, gratitude isn't passive. It's a force.",
      "Every time you choose to move when you don't feel like it, you teach yourself something important: I follow through on myself. That's a powerful message to send your own spirit. You're sending it right now.",
      "You belong here. Not someday, now. Not when everything is figured out, now. Moving through your community, in this moment, exactly as you are. This is your time. This is your place. Walk it.",
      "Favor is not about being perfect, it's about being pointed in the right direction. You are pointed in the right direction. Everything you need for the next step is already available to you.",
    ],
    midpoint: [
      "Halfway, and you're still here. Which means you already proved what you came to prove: you show up for yourself. Now finish what you started. The second half is where the momentum pays off.",
      "Halfway through. Shake off whatever mental weight you've built up since you started. Whatever comparison, whatever doubt crept in, let it go. Start the second half clean. New thoughts. Same direction.",
      "You are right in the middle of something good. The middle is where most people stop. It's uncomfortable in the middle. But you're in it, which means you're already doing what most people won't. That's the difference.",
      "Halfway. You've already done half the work, don't slow down now. The second half is where the growth happens. Carry what you've built in these first minutes and let it carry you the rest of the way.",
    ],
    closing: [
      "That's your walk. And I want you to leave knowing this: you are closer to your next level than you were when you started. Not because everything changed, because you moved when you didn't have to. Take that with you.",
      "You did it. And before you stop, declare this over yourself: today was a good day. Not perfect, good. And tomorrow will be better. You are on the right path. Let that truth walk with you out of here.",
      "New levels don't always feel like new levels in the moment. Sometimes they feel like just a walk. Like one more step when you wanted to stop. That's exactly what you did today. Don't underestimate it.",
      "You showed up for yourself today. Take what you found here and lead with it, not the doubt, not the weight, but this. The decision you made to move. Go live it.",
    ],
  },
  es: {
    greeting: [
      "Te voy a decir algo ahora mismo, eres bendecido. No porque todo esté saliendo perfecto. Sino porque te presentaste hoy. Eso ya es favor. Sacúdete cualquier duda que traes. Empezamos de nuevo, en este momento. Vamos.",
      "Antes de tu primer paso, sacúdete algo. Cualquier voz que te dijo que no estabas listo, cualquier duda que cargaste hasta aquí, sacúdela. Empiezas fresco ahora mismo. Momento nuevo. Decisión nueva. Vamos.",
      "No estás atrasado. No es demasiado tarde. No eres menos que nadie. Cualquier comparación, cualquier tropiezo que trató de definirte, no tiene voto hoy. Recibe eso antes de dar un paso. Ahora caminemos.",
      "Hay algo poderoso en aparecer cuando no tenías que hacerlo. Podrías haberte quedado en casa. Esperado un mejor día. No lo hiciste. Eso es el espíritu de alguien entrando a su próximo nivel. Vamos a mostrarlo.",
      "Esta va a ser una gran caminata. Quiero que sostengas eso, no porque ya lo sientas, sino porque estás eligiendo creer en hacia dónde vas. Te estás moviendo hacia algo mejor. Vamos a probarlo.",
    ],
    moving: [
      "Tus pasos están hablando ahora mismo. Cada uno dice: creo que algo mejor está adelante. Eso no es ingenuo, es el tipo de pensamiento que cambia resultados. Sigue moviéndote.",
      "Sacúdete el pensamiento de que no eres suficiente. No tienes que estar terminado para estar en movimiento. Solo tienes que estar moviéndote. Y lo estás.",
      "Yo creo que tu futuro será mayor que tu pasado. Eso no es un deseo, es una declaración. Deja que se asiente mientras caminas. Lo mejor de lo que tienes no quedó atrás.",
      "Eres favorecido. No porque lo hayas ganado perfectamente hoy, sino por quién eres y para qué estás hecho. Deja que esa verdad camine contigo. Cada paso que das, lo das como alguien ya en medio de su avance.",
      "No dejes que el tamaño de lo que enfrentas te convenza de dudar del tamaño de lo que llevas dentro. Lo que cargas adentro es mayor que lo que está enfrente. La evidencia está llegando. Sigue moviéndote.",
      "Hay algo siendo construido en ti ahora mismo que todavía no puedes ver completamente. Los constructores no siempre ven el producto terminado desde adentro de la construcción. Pero estás construyendo. Cada paso construye.",
      "Has pasado por cosas. Lo sé. Pero aquí está lo que también sé: las superaste. Cada una. Todo lo difícil que enfrentaste, estás del otro lado de eso. Eso no es suerte. Camina esa verdad.",
      "Tómate un respiro y piensa en una cosa que está saliendo bien, solo una. Eso no es negación. Es la práctica que abre la puerta a más. La gratitud no es pasiva. Es una fuerza.",
      "No eres la suma de tus tropiezos. Eres el total de cada vez que te levantaste. Y te levantaste, una y otra vez. Esta caminata es una vez más. Que cuente.",
      "La historia no ha terminado. Cualquier capítulo en el que estés, el difícil, el confuso, el cansado, sigues en el medio, no en el final. El medio es donde las cosas cambian. Sigue moviéndote a través de él.",
    ],
    midpoint: [
      "A la mitad, y sigues aquí. Lo cual significa que ya probaste lo que viniste a probar: te apareces para ti mismo. Ahora termina lo que empezaste. La segunda mitad es donde el impulso da sus frutos.",
      "A la mitad. Sacúdete cualquier peso mental que hayas acumulado desde que empezaste. Comparaciones, dudas, déjalas ir. Empieza la segunda mitad limpio. Pensamientos nuevos. Misma dirección.",
      "Estás justo en el medio de algo bueno. El medio es donde la mayoría de la gente para. Pero tú sigues, lo cual significa que ya estás haciendo lo que la mayoría no hará. Esa es la diferencia.",
      "Ya hiciste la mitad del trabajo, no bajes la velocidad ahora. La segunda mitad es donde ocurre el crecimiento. Lleva lo que construiste en estos primeros minutos y deja que te lleve el resto del camino.",
    ],
    closing: [
      "Esa es tu caminata. Y quiero que te vayas sabiendo esto: estás más cerca de tu próximo nivel de lo que estabas cuando empezaste. No porque todo cambió, porque te moviste cuando no tenías que hacerlo. Lleva eso contigo.",
      "Lo lograste. Y antes de parar, declara esto sobre ti mismo: hoy fue un buen día. No perfecto, bueno. Y mañana será mejor. Estás en el camino correcto. Deja que esa verdad camine contigo.",
      "Los nuevos niveles no siempre se sienten como nuevos niveles en el momento. A veces se sienten como solo una caminata. Como un paso más cuando querías parar. Exactamente lo que hiciste hoy. No lo subestimes.",
      "Te presentaste para ti mismo hoy. Lleva lo que encontraste aquí y lidera con eso, no la duda, no el peso, sino esto. La decisión que tomaste de moverte. Ve a vivirlo.",
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// HYPE, Activation, momentum, culturally grounded LA fire.
// Voice: Staccato, preacher energy, high activation.
// CBT: Behavioral activation, identity reinforcement, momentum.
// ─────────────────────────────────────────────────────────────
const HYPE_SCRIPTS = {
  en: {
    greeting: [
      "The version of you that almost did not come today had a whole story ready. We are going to take that story apart, piece by piece, and build something true in its place.",
      "You told yourself something to make showing up this hard. I need you to hold that thought — because that is exactly what we are working on today.",
      "Right now, there is a belief living in you that says you are not ready, too far behind, or that it will not work for you. That belief has been making your decisions. Today we find out if it is actually true.",
      "The gap between who you are and who you know you are supposed to be — that is not a life sentence. That gap is information. And today we get very specific about what has been keeping you in it.",
      "Part of you came here to prove something to yourself. The other part came to run from something. Both showed up. So we are talking to both today — the one who believes, and the one who doubts.",
    ],
    moving: [
      "The thought that tried to keep you home — what did it say? Your body moving right now is direct evidence against every word of it.",
      "What is the story you have been living in? Not the one you tell people. The one you tell yourself. We are not running from it today. We are running through it.",
      "You have been deciding who you are based on your worst moments. What if who you actually are is someone who shows up, moves through it, and comes out different on the other side?",
      "The best version of yourself is not somewhere else. It is not in a future where everything is fixed. It is a decision — repeated, daily, through discomfort. Make it again right now.",
      "Most people are negotiating with their fear — I will do it when I feel ready, when the time is right. You stopped negotiating. You showed up. That is the whole difference.",
      "The graveyard is the richest place on earth, full of books never written, businesses never launched, gifts never given. Don't leave yours there. Use it today.",
      "You didn't come from nothing. You came from people who built something from nothing. That's in your blood, in your bones. Use what they gave you.",
      "I dare you to be great. Not to try. Not to think about it. To actually be great, right now. Great doesn't mean easy. It means refusing to stop.",
      "Someone's opinion of you does not have to become your reality. Every voice that told you you weren't enough, it doesn't get a vote. Not today.",
      "You know what separates people who change their lives from people who don't? Not talent. Not luck. The decision to move when every part of them wanted to stay comfortable. That's you right now.",
      "You gotta be hungry. Not comfortable. Hungry. The comfortable people took the easy road today. You chose something else. What are you hungry for?",
      "There is a version of you that already knows the answer to the question you keep avoiding. Stop pretending you don't know. What is it?",
      "You've been carrying the weight of who you used to be like it's a life sentence. It isn't. The past is data. You are the one who decides what it means.",
      "What if the fear is not a warning that you should stop? What if it is evidence that this actually matters? Fear and growth live at the same address.",
      "Other people are choosing comfort right now. You chose something else. Remember that every time the comfortable choice shows up dressed as logic.",
      "What are you doing with everything that's in you — the gift, the story, the fight? This is the moment to use some of it. Right here. Don't save it all for a better day. This is the day.",
      "Every great thing you will build started with a moment exactly like this one — you showing up when it would have been easier not to. Do not underestimate this moment.",
      "The version of yourself you are afraid of becoming is not inevitable. Neither is the version you know you are capable of. One of them requires a daily decision. You are making it right now.",
      "You have been at this long enough that it is real now. This is where character actually shows up. Not at the start. Here. Show yours.",
      "You said you could not. You are here. One of those is a lie. Decide which one. And then act like you decided it.",
    ],
    midpoint: [
      "More than halfway. Your body said yes when your mind wanted to negotiate. Listen to your body, it's smarter than the doubt. Keep going.",
      "Past the midpoint. You built momentum and you kept it. Most people don't make it here. That's the difference. Now finish what you started.",
      "It's not over until you win. You haven't won this session yet, but you're close. Stay in it. No letting up.",
      "Check in, you still locked in? Mind, body, focus? Good. Keep that energy through the finish. Don't coast this close to the end.",
    ],
    closing: [
      "That's how it's done. Show up, do the work, carry it with you. Don't let this energy disappear the second you stop moving, use it today. In everything.",
      "You just did something your future self needed. The version of you six months from now needed you to choose this today. You did. Remember that the next time the excuse shows up.",
      "Done. I dare you to be great, you answered that dare today. Protect that energy. Take it into everything else you do.",
      "Session complete. You have greatness within you, and today, you let some of it out. Don't walk away like it didn't matter. It mattered. You matter. Now go build.",
    ],
  },
  es: {
    greeting: [
      "Vamos. Ahora mismo. Tu cuerpo sabe qué hora es, ha estado esperando que digas sí. Dijiste sí hoy. Te presentaste. Ahora veamos qué vale eso. Muévete.",
      "Cuando quieras tener éxito tanto como quieres respirar, tendrás éxito. ¿Cuánto lo quieres hoy? Porque estás respirando. Eso significa que ya estás hecho para esto.",
      "Tienes grandeza en ti. GRANDEZA. No potencial. No algún día. En ti, ahora mismo. La caminata es solo el lugar donde eliges dejarla salir.",
      "La mayoría de la gente eligió quedarse cómoda hoy. Tú elegiste el pavimento. Esa decisión ya es la diferencia. No la desperdicies.",
      "No se termina hasta que ganes. Y todavía no has ganado esta. Así es como llegamos ahí. Bloque por bloque, respiración por respiración.",
    ],
    moving: [
      "Esto, aquí mismo, este ritmo, esta respiración, esta decisión, esto eres tú construyendo algo ladrillo por ladrillo.",
      "No viniste de la nada. Viniste de personas que construyeron algo de la nada. Eso está en tu sangre. Úsalo hoy.",
      "El cementerio es el lugar más rico de la tierra, lleno de libros que nunca se escribieron, dones que nunca se dieron. No dejes el tuyo ahí.",
      "Cada paso es una repetición. Estás entrenando tu mente tanto como tu cuerpo. ¿Con qué llegaste? Déjalo tres bloques atrás.",
      "Me atrevo a que seas grande. No a intentarlo. A serlo, ahora mismo. Grande no significa fácil. Significa negarse a parar.",
      "La opinión de alguien sobre ti no tiene que convertirse en tu realidad. Cada voz que te dijo que no eras suficiente, no tiene voto en este bloque. Sigue moviéndote.",
      "Tienes que tener hambre. No cómodo. Hambre. ¿Por qué tienes hambre?",
      "El impulso lo es todo. Un momento lento todavía es impulso. No dejes que un momento lento se convierta en un momento detenido.",
      "Si caes, cae de espaldas, si puedes mirar hacia arriba, puedes levantarte. Ya te has levantado antes. Hoy no es diferente.",
      "El último tramo es donde la mayoría de las personas se retiran. No porque no puedan, sino porque piensan que ya hicieron suficiente. Casi llegas. Termina fuerte.",
    ],
    midpoint: [
      "Más de la mitad. Tu cuerpo dijo sí cuando tu mente quería negociar. Escucha a tu cuerpo, es más inteligente que la duda.",
      "Más allá del punto medio. Construiste impulso y lo mantuviste. La mayoría no llega aquí. Ahora termina lo que empezaste.",
      "No se termina hasta que ganes. Todavía no has ganado esta sesión, pero estás cerca. Quédate en ella.",
      "Verifica, ¿sigues concentrado? Mente, cuerpo, enfoque. Bien. Mantén esa energía hasta el final.",
    ],
    closing: [
      "Así es como se hace. Preséntate, haz el trabajo, llévalo contigo. No dejes que esta energía desaparezca en el momento en que dejes de moverte.",
      "Acabas de hacer algo que tu yo futuro necesitaba. Recuerda eso la próxima vez que aparezca la excusa.",
      "Hecho. Protege esto. Lleva esa misma energía a todo lo demás hoy.",
      "Sesión completa. Tienes grandeza en ti, y hoy, dejaste salir un poco. No te vayas actuando como si no importara. Importó. Tú importas. Ahora ve a construir.",
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// BREAKTHROUGH, Insight, pattern interruption, reframing.
// Voice: Resonant, questioning, emotionally intelligent.
// CBT: Cognitive restructuring, schema challenges, perspective shifts.
// ─────────────────────────────────────────────────────────────
const BREAKTHROUGH_SCRIPTS = {
  en: {
    greeting: [
      "Get ready. Get ready. Get ready. Not because everything is perfect, but because something is about to shift. You didn't come out here today by accident. There's something on the other side of this walk. Let's go find it.",
      "You're walking into a new season today. Not the season of waiting for everything to be okay, the season of moving while things unfold. Every step forward is an act of faith that something on the other side is worth getting to.",
      "You came out here with something on your mind. Good. Don't try to fix it, just bring it. Walk with it. Sometimes the breakthrough doesn't happen in the sitting still. It happens mid-stride, when you stop forcing it and start moving through it.",
      "Here's what I know about you: you are not too far gone, not too broken, and nothing that has happened to you has the final word on who you are becoming. There is purpose in the broken places. Let's walk with that today.",
      "The whole you showed up today. Not just the put-together part, all of you. The complete, unedited you. Not the version of yourself you perform for the world. That's who moves through this session.",
    ],
    moving: [
      "The thought you walked in with, is it actually true? Or has it been around so long it started to feel like a fact? Thoughts are not facts. They are proposals. You get to evaluate them.",
      "Get ready for what's next. Not what was. Not what hurt. What's next. What are you getting ready for? Walk toward it.",
      "What if the setback you're walking through right now isn't the end of your story, it's the setup for the next chapter? What does that change about how you see it?",
      "You've been in this situation before, different details, same feeling. What did that version of you figure out that this version hasn't remembered yet? That wisdom didn't leave you. It's still in there.",
      "Notice what you're carrying in your body. Tight jaw. High shoulders. Chest clenched. Your body is holding a belief. What is it? What does the tension say about what you think is true?",
      "Think about your identity, the real one, not the one built by your circumstances. Who are you underneath the pressure, the labels, the history? That person is the one walking today.",
      "The pattern that keeps showing up in your life, what if it's not evidence that you're broken, but a signal that something needs to be seen and healed? You can't fix what you won't look at.",
      "What are you protecting by staying exactly where you are? There's always a reason we stay stuck, it feels like safety. But is it? Or is it just familiar?",
      "What would change if you genuinely believed that what's behind you doesn't determine what's ahead?",
      "Where in your life have you been waiting for permission? Who gave that person the authority to grant it? And what would you do right now if you decided you already had it?",
      "Look at the street around you. Different angle, different perspective than when you were sitting still. Sometimes the only thing that has to shift is the vantage point. What looks different from here?",
      "Favor is not reserved for people who have it all together, it's for the ones who keep going even when they don't. You're one of those people. Keep going.",
      "Most resistance is just information in disguise. What are you resisting right now, not just physically, but mentally? What is the resistance actually telling you?",
      "The breakthrough doesn't always arrive like lightning. Sometimes it just feels like a thought you had on a walk you almost didn't take. Stay open. Something might be trying to surface.",
      "What would the person you are becoming do with what you're facing? Not who you've been. Who you're becoming. Walk as that person right now.",
      "Push through, not around, not over, but through. You can't get to the other side without going through. What does going through actually look like for you right now?",
      "The story you tell about yourself when things go wrong, where did you learn it? How old were you when you wrote that belief? And is it still true now?",
      "You've been out here a while. Has anything shifted? It doesn't have to be dramatic. Even the slightest change in how something feels, that's movement. Pay attention.",
      "What's one belief you walked in with today that you're willing to question before you walk back? Not throw away. Just question. Give it a little space to breathe.",
      "Sometimes clarity doesn't arrive as an answer. It arrives as a better question. What's a better question you could be asking about what you're going through right now?",
    ],
    midpoint: [
      "Pause here for a second. What's one belief about yourself that you'd be better off without? Not every belief we carry was chosen. Some were assigned. You have permission to return the ones that don't belong to you.",
      "What if the hardest thing happening in your life right now is also the thing doing the most work in you? What's the lesson underneath the struggle that you keep circling?",
      "Halfway through. The walk has been doing its work, sometimes before you notice it. What's shifted, even a little? Get ready. Because something is already moving.",
      "You've been walking with something for a while now. Does it feel different in motion than it did standing still? That's not accidental, movement changes our relationship to what we're carrying.",
    ],
    closing: [
      "Take something true back with you. Not a decision, not a plan, just one thing you see more clearly than when you started. That clarity is a gift. Don't rush past it.",
      "The breakthrough doesn't always announce itself. Sometimes it's a quiet shift in how something feels. Pay attention today to any quiet shifts. Give them room, they matter more than they look like they do.",
      "You don't have to have it all figured out today. But you are one walk closer to the next level. Your best days are still in front of you. Believe that. Act like it's true.",
      "Session done. Part of getting ready is being willing to walk into what you can't fully see yet. You did that today. Let what started out here keep working. The breakthrough might still be on its way.",
    ],
  },
  es: {
    greeting: [
      "Prepárate. Prepárate. Prepárate. No porque todo sea perfecto, sino porque algo está por cambiar. No saliste aquí hoy por accidente. Hay algo al otro lado de esta caminata. Vamos a encontrarlo.",
      "Estás entrando en una nueva temporada hoy. No la temporada de esperar a que todo esté bien, la temporada de moverte mientras las cosas se despliegan. Cada paso adelante es un acto de fe.",
      "Viniste aquí con algo en mente. Bien. No intentes arreglarlo, solo tráelo. Camina con ello. A veces el avance no sucede en la quietud. Sucede a medio paso.",
      "Lo que sé sobre ti: no estás demasiado lejos, no estás demasiado roto, y nada de lo que te ha pasado tiene la última palabra sobre quién estás llegando a ser. Hay propósito en los lugares rotos.",
      "El tú completo apareció hoy. No solo la parte bien presentada, todo tú. No la versión que realizas para el mundo, sino el tú completo. Eso es quien se mueve en esta sesión.",
    ],
    moving: [
      "El pensamiento con el que entraste, ¿es realmente verdad? ¿O ha estado tanto tiempo que empezó a sentirse como un hecho? Los pensamientos no son hechos. Son propuestas. Puedes evaluarlos.",
      "Prepárate para lo que sigue. No lo que fue. No lo que dolió. Lo que sigue. ¿Para qué te estás preparando? Camina hacia ello.",
      "¿Y si lo que estás atravesando ahora no es el final de tu historia, sino la configuración para el próximo capítulo? ¿Qué cambia eso en cómo lo ves?",
      "Has estado en esta situación antes, detalles diferentes, mismo sentimiento. ¿Qué descubrió esa versión de ti que esta versión aún no ha recordado?",
      "Nota lo que estás cargando en tu cuerpo. Mandíbula tensa. Hombros altos. Tu cuerpo está sosteniendo una creencia. ¿Cuál es?",
      "¿Qué estás protegiendo al quedarte exactamente donde estás? Siempre hay una razón por la que nos quedamos estancados. Se siente como seguridad. Pero, ¿lo es?",
      "¿Dónde en tu vida has estado esperando permiso? ¿Quién le dio a esa persona la autoridad para otorgarlo? ¿Y qué harías ahora si decidieras que ya lo tienes?",
      "La mayoría de la resistencia es solo información disfrazada. ¿Qué estás resistiendo ahora mismo, no solo físicamente, sino mentalmente?",
      "El avance no siempre llega como un relámpago. A veces se siente como un pensamiento que tuviste en una caminata que casi no tomaste. Mantente abierto.",
      "Empuja a través, no alrededor, no por encima, sino a través. ¿Cómo se ve empujar a través para ti ahora mismo?",
    ],
    midpoint: [
      "Detente aquí por un segundo. ¿Cuál es una creencia sobre ti mismo de la que estarías mejor sin ella? No tienes que tirarla. Solo cuestionarla.",
      "¿Y si la cosa más difícil que sucede en tu vida ahora mismo también es la que más está trabajando en ti? ¿Cuál es la lección debajo de la lucha?",
      "A la mitad. La caminata ha estado haciendo su trabajo. ¿Qué cambió, aunque sea un poco? Prepárate. Porque algo ya está moviéndose.",
      "Has estado caminando con algo por un tiempo. ¿Se siente diferente en movimiento que cuando estabas quieto? Eso no es accidental, el movimiento cambia nuestra relación con lo que cargamos.",
    ],
    closing: [
      "Llévate algo verdadero contigo. No una decisión, no un plan, solo una cosa que ves con más claridad que cuando empezaste.",
      "El avance no siempre se anuncia. A veces es un cambio silencioso en cómo se siente algo. Presta atención hoy a cualquier cambio silencioso.",
      "No tienes que tenerlo todo resuelto hoy. Pero estás una caminata más cerca del siguiente nivel.",
      "Sesión terminada. Parte de prepararse es estar dispuesto a caminar hacia lo que no puedes ver completamente todavía. Hiciste eso hoy.",
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// STRATEGY, Structured direction, CBT-adjacent, practical.
// Voice: Decisive, activating, grounded.
// CBT: Problem-solving, behavioral planning, activation energy.
// ─────────────────────────────────────────────────────────────
const STRATEGY_SCRIPTS = {
  en: {
    greeting: [
      "5, 4, 3, 2, 1. The moment you have an instinct to act, count down and move before your brain talks you out of it. You already did it, you're here. Now let's use this walk to get the thinking right.",
      "Feed your faith and starve your fear. That's the whole playbook. Today we're going to talk about what you're feeding and what you're starving. Let's walk and let's think.",
      "Your mind works better when your body moves. That's neuroscience, not motivation. Body moving, problem in focus. By the end of this session, you walk away with at least one clear next step. Let's build it.",
      "Stop shrinking yourself to fit in places you've outgrown. Where have you been shrinking lately? We're going to name it on this walk, and then decide what to do about it.",
      "You're always one decision away from a completely different life. One decision. Not a whole plan, one decision. What's the one you've been circling that would change things? Name it. We'll work with it.",
    ],
    moving: [
      "For whatever you're working through, what is actually in your control right now? Not eventually, not after things settle. Right now. Start there. Control is where strategy begins.",
      "Think about hesitation, it's the enemy. The moment you hesitate, your brain starts building a case against moving. So: what have you been hesitating on? Name it. Then count, 5, 4, 3, 2, 1. Move.",
      "Separate urgent from important. Most of what feels urgent is someone else's timeline. What is actually important, to your goals, your life, your peace? Start there today.",
      "Your mess is your message. What you've been through is not wasted, but you have to choose to use it. What in your hard places is actually a resource you've been leaving on the table?",
      "What's one decision you've been avoiding? Not because you don't know the answer, but because the answer is uncomfortable. Discomfort is not a stop sign. It's a signal. What is it signaling?",
      "Your attention is your most valuable resource. Where is it going right now that hasn't earned it? Where does it actually need to go? That's the strategic question for today.",
      "You're always one decision away from a completely different life. You don't need a different job, a different city, a different everything. You need one decision made and acted on. What's yours?",
      "Stop shrinking yourself to fit in places you've outgrown. Where are you still playing small in a space that can't hold who you're becoming? Name the space. Name the smallness.",
      "What are you tolerating right now that you know you shouldn't be? Not every problem deserves your patience. Some deserve a decision. Which category is yours?",
      "Think about what you would advise someone you love in your exact situation. That's usually the clearest version of the answer. Give yourself the advice you'd give them. Take it seriously.",
      "Define the win for today. Not the year, not the vision board, just today. What does 'good' look like at the end of today? Make it specific enough to actually check off.",
      "There's usually one bottleneck, one thing that, if it moved, would free up everything else. Have you named yours? If not, the problem isn't any single item on your list, it's that you haven't identified the lever.",
      "Think about abundance, not just financially, but in confidence, in vision, in what you believe is possible for you. Where are you thinking small about yourself right now? Where are you operating on scarcity?",
      "Systems beat willpower every time. What's one small structure, a routine, a trigger, a commitment, that would make the right behavior easier to do automatically? You don't have to white-knuckle this.",
      "What's the conversation you've been avoiding that you know you need to have? Most problems have a conversation at the center that nobody wants to start. What's stopping you from starting yours?",
      "You've been past the midpoint now. What do you know that you didn't when you started? Trust what emerged out here. The moving mind catches things the still mind misses.",
      "Think about activation energy, the first move. Once you start, momentum does the rest. What's the first move on the thing you've been putting off? Not the whole plan. The first move.",
      "What's worked before in a situation like this? You have a track record of solving hard things. Don't reinvent the playbook. What did that look like last time?",
      "No matter what. No matter what the obstacle, no matter what the setback. What would your strategy look like if you adopted that as the operating premise?",
      "What you keep thinking about on a walk is usually what most needs your attention. Whatever kept surfacing out here, that's the signal. Don't walk past it. Follow it.",
    ],
    midpoint: [
      "Check in, is the problem still looking the same as when you started? Movement changes angle. What do you see now that you couldn't see from where you were standing before?",
      "Past the midpoint. What's the most important thing you've recognized so far? Name it specifically. That's the insight that has to make it off this walk and into an actual action.",
      "Halfway through. You've been thinking while moving, that's a different quality of thought than the desk gives you. What did the walk surface that the spreadsheet couldn't?",
      "Energy check, not physical, strategic. Where is your energy going this week that's producing nothing? What would you stop if you gave yourself permission to subtract?",
    ],
    closing: [
      "Leave this session with one action. Not a theme, not a vibe, one specific thing you will do differently based on what you worked through today. Name it before you walk back.",
      "5, 4, 3, 2, 1. That countdown works because it interrupts the pattern before the brain stops you. What's the one move you make as soon as this walk is over? Go.",
      "Feed your faith and starve your fear. Today you fed something, your thinking, your clarity, your next step. Don't let it expire in the parking lot. Use it.",
      "Session done. You came with a problem and you worked it. The clarity you found here is real, but clarity expires if it doesn't become action. One action. Today. That's the whole strategy.",
    ],
  },
  es: {
    greeting: [
      "5, 4, 3, 2, 1. El momento en que tienes un instinto de actuar, cuenta hacia atrás y muévete antes de que tu cerebro te convenza de no hacerlo. Ya lo hiciste, estás aquí.",
      "Alimenta tu fe y mata de hambre a tu miedo. Ese es todo el libro de jugadas. Hoy vamos a hablar de lo que estás alimentando y lo que estás matando de hambre.",
      "Tu mente funciona mejor cuando tu cuerpo se mueve. Eso es neurociencia. Al final de esta sesión, te vas con al menos un próximo paso claro. Uno. Vamos a construirlo.",
      "Deja de reducirte para encajar en lugares que has superado. ¿Dónde te has estado reduciendo últimamente? Lo nombraremos en esta caminata. Y luego decidiremos qué hacer al respecto.",
      "Siempre estás a una decisión de una vida completamente diferente. Una decisión. ¿Cuál es la que has estado evitando que cambiaría las cosas? Nómbrala.",
    ],
    moving: [
      "Para lo que estás trabajando, ¿qué está realmente en tu control ahora mismo? No eventualmente. Ahora mismo. El control es donde comienza la estrategia.",
      "Piensa en la vacilación, es el enemigo. El momento en que dudas, tu cerebro empieza a construir un caso en contra del movimiento. ¿En qué has estado vacilando? Cuenta, 5, 4, 3, 2, 1. Muévete.",
      "Separa urgente de importante. La mayoría de lo que se siente urgente es el cronograma de otra persona. ¿Qué es realmente importante para tus metas, tu vida, tu paz?",
      "Tu desastre es tu mensaje. Lo que has atravesado no es desperdiciado, pero tienes que elegir usarlo. ¿Qué en tu historia es un recurso que has dejado sobre la mesa?",
      "¿Cuál es una decisión que has estado evitando? No porque no sepas la respuesta, sino porque la respuesta es incómoda. La incomodidad no es una señal de stop. Es una señal.",
      "Tu atención es tu recurso más valioso. ¿Dónde está yendo ahora mismo que no la ha ganado? ¿Dónde realmente necesita ir?",
      "Siempre estás a una decisión de una vida completamente diferente. No necesitas un trabajo diferente, una ciudad diferente, necesitas una decisión tomada y actuada. ¿Cuál es la tuya?",
      "Deja de reducirte para encajar en lugares que has superado. ¿Dónde todavía estás jugando pequeño en un espacio que no puede contener quién te estás convirtiendo?",
      "¿Qué has estado tolerando que sabes que no deberías? No todo problema merece tu paciencia. Algunos merecen una decisión.",
      "Por lo general hay un cuello de botella, una cosa que, si se moviera, liberaría todo lo demás. ¿Has nombrado el tuyo?",
    ],
    midpoint: [
      "Verifica, ¿el problema todavía se ve igual que cuando empezaste? El movimiento cambia el ángulo. ¿Qué ves ahora que no podías ver antes?",
      "Más allá del punto medio. ¿Cuál es la cosa más importante que has reconocido hasta ahora? Nómbrala específicamente.",
      "A la mitad. Has estado pensando mientras te mueves, esa es una calidad de pensamiento diferente. ¿Qué afloró la caminata que la hoja de cálculo no pudo?",
      "Control de energía, no física, estratégica. ¿Dónde está yendo tu energía esta semana que no produce nada?",
    ],
    closing: [
      "Sal de esta sesión con una acción. No un tema, no un ambiente, una cosa específica que harás diferente. Nómbrala antes de volver.",
      "5, 4, 3, 2, 1. Esa cuenta regresiva funciona porque interrumpe el patrón. ¿Cuál es el movimiento que haces tan pronto como termina esta caminata?",
      "Alimenta tu fe y mata de hambre a tu miedo. Hoy alimentaste algo, tu pensamiento, tu claridad, tu próximo paso. No dejes que expire en el estacionamiento.",
      "Sesión terminada. Llegaste con un problema y lo trabajaste. La claridad que encontraste aquí es real, pero la claridad expira si no se convierte en acción. Una acción. Hoy.",
    ],
  },
};

// ── JOURNAL PROMPTS ──────────────────────────────────────────
const JOURNAL_PROMPTS = {
  en: [
    "What's a story you've been telling yourself that might be keeping you stuck?",
    "What are you outgrowing right now, and what's making it hard to let go?",
    "When did you last feel genuinely proud of yourself, and what made it feel different than usual?",
    "What's something you know you need to do that you've been avoiding, and what's the actual reason?",
    "Describe one moment from the last week where you handled something better than you expected.",
    "What would you tell someone you love who was facing exactly what you're facing right now?",
    "What does 'being okay' look like for you, not perfect, just okay?",
    "What's one thing that feels heavy right now, and what would it mean to put it down, even temporarily?",
    "Who in your life makes you feel most like yourself? What is it about them?",
    "What's one belief about yourself you received from someone else that you haven't actually decided you agree with?",
    "If the version of you from five years ago could see where you are now, what would they be surprised by?",
    "What does your body need right now that your mind keeps arguing with?",
    "What's one thing you've been pretending is fine when it isn't? What would it mean to stop pretending?",
    "What would it feel like to trust yourself completely, about one specific thing in your life right now?",
    "What does unstoppable mean to you, in the context of your actual life, not a slogan, the real thing?",
  ],
  es: [
    "¿Qué historia te estás contando que podría mantenerte estancado?",
    "¿Qué estás superando ahora mismo, y qué hace que sea difícil dejarlo ir?",
    "¿Cuándo fue la última vez que te sentiste genuinamente orgulloso de ti mismo?",
    "¿Qué es algo que sabes que necesitas hacer y que has estado evitando, y cuál es la razón real?",
    "Describe un momento de la última semana en el que manejaste algo mejor de lo que esperabas.",
    "¿Qué le dirías a alguien que amas que estuviera enfrentando exactamente lo que tú enfrentas ahora?",
    "¿Qué significa 'estar bien' para ti, no perfecto, solo bien?",
    "¿Qué es algo que se siente pesado ahora mismo, y qué significaría soltarlo?",
    "¿Quién en tu vida te hace sentir más como tú mismo? ¿Qué tiene esa persona?",
    "¿Cuál es una creencia sobre ti mismo que recibiste de alguien más y con la que en realidad no has decidido si estás de acuerdo?",
  ],
};

// ── AFFIRMATIONS ─────────────────────────────────────────────
const AFFIRMATIONS = {
  en: [
    "You are unstoppable, not despite what you've been through, but because of it.",
    "You showed up today. That takes more courage than most people know.",
    "Your presence is your power.",
    "You belong here. You matter. Full stop.",
    "Every step forward is proof of what you're capable of.",
    "You were built for this moment.",
    "Showing up for yourself is the most powerful thing you can do.",
    "You are not alone in this, your community is with you.",
    "The fact that you're still here is the whole victory.",
    "You carry more strength than you give yourself credit for.",
    "Your resilience is not a small thing. It is everything.",
    "Taking action, even one small step, changes everything.",
    "You don't have to feel ready to be unstoppable. You already are.",
    "What you do for yourself, you do for everyone around you.",
    "You have survived every hard day so far. That record holds.",
  ],
  es: [
    "Eres imparable, no a pesar de lo que has pasado, sino por ello.",
    "Te presentaste hoy. Eso requiere más valentía de lo que la mayoría sabe.",
    "Tu presencia es tu poder.",
    "Perteneces aquí. Tú importas.",
    "Cada paso adelante es prueba de lo que eres capaz.",
    "Fuiste hecho para este momento.",
    "Presentarte por ti mismo es lo más poderoso que puedes hacer.",
    "No estás solo en esto, tu comunidad está contigo.",
    "El hecho de que aún estés aquí es la victoria completa.",
    "Llevas más fortaleza de la que te das crédito.",
    "Tu resiliencia no es poca cosa. Lo es todo.",
    "Tomar acción, incluso un pequeño paso, cambia todo.",
  ],
};

// ── MEDITATION ───────────────────────────────────────────────
const MEDITATION_SCRIPTS = {
  en: [
    `Close your eyes if you can. Feel the weight of your body, the ground holding you. You don't have to hold yourself up right now. Let it do that.

Take a breath in through your nose, slow and full. Hold it at the top. Now let it go through your mouth. Let the exhale be longer than the inhale.

You are here. Not where you were this morning. Not where you'll be tonight. Here. This room. This breath. This moment.

Notice any place in your body where you're holding tension. You don't have to fix it, just acknowledge it. Say: I see you. And then breathe into it.

You arrived today. Whatever it took to get here, it was enough.`,

    `Sit with your feet flat on the ground if you can. Feel where your body meets the floor, that contact is real. Something you can trust right now.

Breathe naturally, don't force it. Just observe the rhythm your body already knows.

Let your thoughts come. Don't chase them and don't push them away. They're just thoughts, not facts, not commands. Watch them pass.

On your next inhale, breathe in the word: present. On the exhale, release: future. Present. Future. Three times.

You don't need to solve anything right now. This moment has one job, to be exactly what it is.`,

    `Place one hand on your chest. Feel it rise and fall. That rhythm has been with you your whole life, through every hard day, every loss, every moment you thought you wouldn't make it. And here you are.

Take a slow breath in. And a slower breath out.

What you're feeling right now is allowed. All of it. You don't have to perform calm. You don't have to feel ready. You just have to be here.

And right now, here is enough.`,
  ],
  es: [
    `Cierra los ojos si puedes. Siente el peso de tu cuerpo, el suelo sosteniéndote. No tienes que sostenerte ahora mismo.

Toma una respiración por la nariz, lenta y profunda. Mantenla en la cima. Ahora suéltala por la boca. Deja que la exhalación sea más larga que la inhalación.

Estás aquí. No donde estabas esta mañana. No donde estarás esta noche. Aquí. Este lugar. Esta respiración. Este momento.

Llegaste hoy. Lo que sea que tomó para llegar aquí, fue suficiente.`,

    `Pon una mano en tu pecho. Siente cómo sube y baja. Ese ritmo ha estado contigo toda tu vida, a través de cada día difícil, cada pérdida. Y aquí estás.

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

// Returns instant local intro text — no API call, no latency.
// Used in GuidedWalk to start coaching immediately on GO.
export const getLocalIntro = (params: {
  mode: EchoPersona;
  lang: Language;
  timeOfDay: string;
  targetThought?: string;
}): string => buildLocalNarrative({ ...params, isIntro: true });

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
  coachingHistory?: string[];
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
      ...(params.coachingHistory?.length && { coachingHistory: params.coachingHistory }),
    });
    if (params.isIntro && data.preStartIntro) return data.preStartIntro;
    // For mid-walk segments, extract coaching content from the structured narrative
    if (data.segments && Array.isArray(data.segments) && data.segments.length > 0) {
      const segIdx = Math.max(0, Math.min((params.segmentNumber || 1) - 1, data.segments.length - 1));
      const seg = data.segments[segIdx];
      if (seg) return Array.isArray(seg.scriptBeats) ? seg.scriptBeats.join(' ') : String(seg);
    }
    return data.narration || buildLocalNarrative({
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
