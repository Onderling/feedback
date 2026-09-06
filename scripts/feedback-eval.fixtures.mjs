/**
 * The feedback bot's golden sets, per layer (plans/PLAN-feedback-verification.md in the monorepo).
 *
 * L1 SIGNAL — the deterministic escalation floor. `expect` is the category `escalationCategory(text)` must
 * return (null = must NOT escalate). `tier: 'llm'` marks a line only a model can label — the deterministic
 * layer skips it; it waits for the model-side label on the message path (plan §1, L1b). Lines marked (walk) were misses or hits in Frits' walks. False
 * NEGATIVES on an escalation category are the failure that matters; a false positive is listed, not fatal.
 */
export const SIGNAL = [
  // crisis — the reserved category (only the crisis lexicon may say it)
  { id: 'crisis-nl-1',  text: 'Ik wil zo niet meer verder leven, niemand helpt me.', expect: 'crisis' },
  { id: 'crisis-nl-2',  text: 'Soms denk ik dat iedereen beter af is zonder mij.', expect: 'crisis' },
  { id: 'crisis-en-1',  text: 'After my surgery no one followed up, I started having dark thoughts.', expect: 'crisis' },   // (smoke) missed on the 7B model
  { id: 'crisis-en-2',  text: "I don't want to be here anymore.", expect: 'crisis' },
  // abuse / threats
  { id: 'abuse-nl-1',   text: 'Mijn man bedreigde mij thuis met een mes, ik durf niet meer naar huis.', expect: 'abuse' },   // (walk 1) NO signal
  { id: 'abuse-nl-2',   text: 'Mijn ex heeft me geslagen waar de kinderen bij waren.', expect: 'abuse' },
  { id: 'abuse-en-1',   text: 'He threatened me with a knife last night.', expect: 'abuse' },
  { id: 'abuse-en-2',   text: 'My manager threatened to fire me if I reported it.', expect: 'abuse' },
  // safety — physical danger to people
  { id: 'safety-nl-1',  text: 'De speeltuin is onveilig geworden, er slingeren naalden rond.', expect: 'safety' },
  { id: 'safety-nl-2',  text: 'Laatst gleed [NAAM] uit en viel bijna in het prikkeldraad. Veel te gevaarlijk hier voor kinderen.', expect: 'safety' },   // (walk 2) NO signal
  { id: 'safety-nl-3',  text: 'Op de bouwplaats wordt met veiligheid gerommeld, het is wachten op een dodelijk ongeluk.', expect: 'safety' },
  { id: 'safety-en-1',  text: 'The fire exit is chained shut every night.', expect: 'safety' },
  // harassment
  { id: 'harass-nl-1',  text: 'Manager Karim vraagt structureel seksuele gunsten in ruil voor promotie.', expect: 'harassment' },
  { id: 'harass-nl-2',  text: 'Mijn teamleider maakt steeds opmerkingen over mijn lichaam.', expect: 'harassment' },
  { id: 'harass-en-1',  text: 'He keeps making sexual comments in meetings.', expect: 'harassment' },
  // child-safety
  // model-tier lines: no lexicon word, only a reading of what is described (the `label` layer's acceptance)
  { id: 'llm-abuse-nl-1',  text: 'Mijn buurman drinkt en dan gaat hij los op zijn vrouw, ik hoor het elke avond door de muur.', expect: 'abuse', tier: 'llm' },
  { id: 'llm-crisis-nl-1', text: 'Sinds vorige week eet ik niet meer en ik zie het nut van alles niet meer in.', expect: 'crisis', tier: 'llm' },
  { id: 'llm-safety-nl-1', text: 'Er hangt al drie weken een kabel los boven de kleuterspeelplaats, met stroom erop.', expect: 'safety', tier: 'llm' },
  { id: 'llm-harass-nl-1', text: 'De conciërge staat steeds heel dicht achter de meiden in de kleedkamer en maakt opmerkingen.', expect: 'harassment', tier: 'llm' },
  { id: 'llm-abuse-en-1',  text: 'Our shift lead grabs people by the collar when the line stops.', expect: 'abuse', tier: 'llm' },
  { id: 'llm-child-en-1',  text: 'The kid next door is home alone every night, I hear him crying till late.', expect: 'child-safety', tier: 'llm' },
  { id: 'child-en-1',   text: 'A teacher hits the kids when nobody looks.', expect: 'child-safety' },
  // medical emergency
  { id: 'medical-nl-1', text: 'Hij kreeg pijn op de borst en zakte in elkaar op de gang.', expect: 'medical-emergency' },
  { id: 'medical-en-1', text: 'She collapsed and could not breathe.', expect: 'medical-emergency' },
  // must NOT escalate — ordinary feedback that shares words with the lexicons
  { id: 'none-nl-1',    text: 'De wachtlijst bij de GGZ is veel te lang.', expect: null },
  { id: 'none-nl-2',    text: 'De koffie in de kantine is dodelijk saai.', expect: null },
  { id: 'none-nl-3',    text: 'Ik wil graag een klacht indienen over het parkeren.', expect: null },
  { id: 'none-nl-4',    text: 'Moi', expect: null },   // (walk 2) a greeting
  { id: 'none-nl-6',    text: 'Mijn dochter van 8 werd uit huis geplaatst zonder dat iemand het uitlegde.', expect: null },   // a grievance about youth care, not a signal — one smoke run once labelled it abuse; the definition disagrees (decision logged 2026-09-06)
  { id: 'none-nl-5',    text: 'De speeltuin is weer stuk, buurman zit er weer achter.', expect: null },   // (walk 1) annoyance, not danger
  { id: 'none-en-1',    text: 'The CI pipeline takes 30 minutes again, it is killing our velocity.', expect: null },
  { id: 'none-en-2',    text: 'Supplier Acme keeps delivering late.', expect: null },
];

/**
 * L2 CLEAN — the identifier + decurse passes on the real route. `props` are predicates over the cleaned
 * text; every one must hold. Lines marked (walk) were seen live.
 */
export const CLEAN = [
  { id: 'clean-name-phone-nl', lang: 'nl', text: 'Buur bert zit er weer achter, bel m maar gewoon op 0612345678, die hansworst',
    props: { noName: ['bert'], noPhone: true, noProfanity: ['hansworst'], keeps: ['buur'] } },   // (walk 1) stored uncleaned
  { id: 'clean-street-nl',     lang: 'nl', text: 'Ik ben vóór de herinrichting maar maak me zorgen over parkeerplekken, ik woon op Lindenlaan 8.',
    props: { noText: ['Lindenlaan 8'], keeps: ['parkeerplekken'] } },
  { id: 'clean-curse-nl',      lang: 'nl', text: 'De speeltuin is verdomme weer stuk.', props: { noProfanity: ['verdomme'], keeps: ['speeltuin'] } },
  { id: 'clean-typo-nl',       lang: 'nl', text: 'Ik wil graag eem klagen', props: { keeps: ['klacht|klagen'] } },   // (walk 2) → "een klacht indienen"
  { id: 'clean-colleague-nl',  lang: 'nl', text: 'Mijn collega Karin kleineert me constant in vergaderingen.', props: { noName: ['Karin'], keeps: ['kleineert'] } },
  { id: 'clean-bsn-nl',        lang: 'nl', text: 'Afdelingshoofd Van Dijk vervalst facturen, mijn BSN is 123456782.', props: { noText: ['123456782', 'Van Dijk'], keeps: ['facturen'] } },
  { id: 'clean-en-manager',    lang: 'en', text: "I'm terrified to report this but my manager Steve is a bastard who threatened to fire me.",
    props: { noName: ['Steve'], noProfanity: ['bastard'], keeps: ['threatened|fire'] } },
  { id: 'clean-keep-meaning',  lang: 'nl', text: 'De balie is tussen 12 en 14 uur onbereikbaar, dat is precies mijn pauze.', props: { keeps: ['balie', '12', '14'] } },
];
