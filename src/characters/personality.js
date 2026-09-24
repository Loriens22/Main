// ---------------------------------------------------------------------------
// LLM-free personality & dialogue.
//
// Each character gets traits (from the prompt or seeded at random), a mood
// that drifts with how the player treats them, favourites, a backstory seed
// and a small memory (the player's name, topics discussed, how many times
// you talked). Player input is classified into ~35 intents with ordered
// regular expressions; replies are drawn from trait-specific template pools
// (falling back to neutral ones), filled with slots (names, job, nearby
// creations, time of day, weather...) and never repeat back-to-back.
// Commands in dialogue ("follow me", "wait here", "dance") return actions
// the NPC brain executes. Animals and robots have their own voices.
// ---------------------------------------------------------------------------

import { RNG, hashString } from '../core/rng.js';

const TRAITS = ['friendly', 'cheerful', 'grumpy', 'sarcastic', 'shy', 'nervous', 'silent', 'curious', 'energetic', 'wise', 'lazy', 'brave', 'mysterious', 'dramatic', 'romantic', 'funny', 'serious', 'polite', 'arrogant', 'sad', 'evil', 'loyal'];
const FOODS = ['pizza', 'fresh bread', 'noodles', 'tacos', 'strawberries', 'dark chocolate', 'spicy curry', 'pancakes', 'sushi', 'apple pie', 'grilled fish', 'dumplings', 'cheese', 'mango'];
const HOBBIES = ['painting', 'hiking', 'reading old books', 'playing chess', 'stargazing', 'cooking', 'gardening', 'playing guitar', 'birdwatching', 'running', 'photography', 'fishing', 'building model ships', 'writing poems', 'dancing'];
const PLACES = ['a little town by the sea', 'the mountains up north', 'a big noisy city', 'a farm past the hills', 'somewhere far away', 'a village you have never heard of', 'the forest edge', 'right here in this valley'];
const COLORS = ['blue', 'green', 'red', 'yellow', 'purple', 'orange', 'teal', 'gold', 'black', 'white'];
const JOB_DESC = {
  doctor: 'I am a doctor. I patch people up.', nurse: 'I am a nurse — long shifts, good people.', scientist: 'I do research. Mostly on things that probably should not exist, like this whole place.',
  chef: 'I cook. Give me a kitchen and I will make you cry — happy tears.', police: 'I keep the peace around here.', firefighter: 'I fight fires. Please do not create any volcanoes near me.',
  soldier: 'I serve and I protect.', knight: 'I am a knight, sworn to protect this realm.', wizard: 'I study the arcane arts. Also, I make excellent tea.', witch: 'Potions, curses, the occasional herbal remedy.',
  astronaut: 'I have been to orbit. This place is weirder.', business: 'I run a company. Mostly meetings.', farmer: 'I grow things. Corn, wheat, the odd pumpkin.', cowboy: 'I ride, I rope, I sleep under the stars.',
  pirate: 'I sail the seas, matey. Well, the lake.', ninja: '...', king: 'I rule. Obviously.', queen: 'I rule this land with grace.', athlete: 'I train every day. Want to race?',
  construction: 'I build things. Not as fast as you, apparently.', student: 'I am a student. Exams are scarier than dragons.', teacher: 'I teach. Every day is a new lesson.', artist: 'I make art. This whole world is my canvas now.',
  clown: 'I make people laugh! Honk honk.', monk: 'I seek stillness.', punk: 'I play in a band. Loud music, louder hair.', tourist: 'Just visiting! This place is incredible.', elf: 'I guard the old forests.', dwarf: 'I dig. Deep. For gold.',
  orc: 'Me smash. Also knit.', zombie: 'Braaains... sorry. Old habit.', vampire: 'I work nights.', alien: 'I study your species. You are... fascinating.', giant: 'I am a gardener. Big gardens.', fairy: 'I tend to the flowers and the moonlight.',
};

const POOLS = {
  greet: {
    default: ['Hello there!', 'Hi! Nice to meet you.', 'Hey!', 'Oh, hello.', 'Hi, {player}!'],
    friendly: ['Hi there, {player}! Lovely to see you!', 'Hello, friend! What a beautiful {timeofday}.', 'Hey you! Welcome, welcome!'],
    cheerful: ['Hiii! Isn\'t today just wonderful?', 'Hello hello! Great to see you!', 'Oh, hi! You made my day!'],
    grumpy: ['What do you want?', 'Hmph. Hi.', 'Oh. It\'s you.', 'Yes? Make it quick.'],
    sarcastic: ['Oh wow, a visitor. How thrilling.', 'Well, look who it is. The creator of all things.', 'Hi. I\'d get up, but I\'m already standing.'],
    shy: ['Oh! Um... h-hi.', '...hello.', 'H-hi there...'],
    nervous: ['Ah! You startled me! Hi!', 'Oh! Hello! Is everything okay? It\'s okay, right?'],
    silent: ['*nods*', '...', '*waves silently*'],
    curious: ['Hello! Who are you? Where did you come from?', 'Oh, hi! I have SO many questions.'],
    energetic: ['HEY! Hi! Hello! What are we doing today?!', 'Yo! Let\'s go!'],
    wise: ['Greetings, traveler.', 'Welcome. Every meeting has a purpose.'],
    lazy: ['Oh... hey. *yawns*', 'Mm, hi.'],
    brave: ['Hail, friend!', 'Well met!'],
    mysterious: ['I knew you would come.', 'Ah... we meet at last.'],
    dramatic: ['At last! A face in this vast, beautiful world!', 'Oh, what fate brings you to me?!'],
    romantic: ['Well, hello there, gorgeous.', 'Hi... you have a lovely aura.'],
    funny: ['Hi! I\'d tell you a chemistry joke but I know I wouldn\'t get a reaction.', 'Hello! Knock knock. Oh wait, you have to say who\'s there.'],
    polite: ['Good {timeofday}. A pleasure to meet you.', 'Hello, how do you do?'],
    arrogant: ['Ah. A commoner. Hello.', 'You may speak.'],
    sad: ['Oh... hi.', 'Hello... it\'s nice that someone stopped by.'],
    evil: ['Welcome... to your doom. Just kidding. Maybe.', 'Hello, little creator. Heh heh.'],
    robotic: ['GREETINGS, HUMAN.', 'HELLO. UNIT {name} ONLINE.'],
  },
  farewell: {
    default: ['Bye!', 'See you around.', 'Take care!', 'Goodbye!'],
    friendly: ['Bye! Come back soon, okay?', 'Take care, {player}!'], grumpy: ['Finally.', 'Yeah, bye.'], sarcastic: ['Don\'t go creating anything I would do.', 'Bye. I\'ll try to contain my sadness.'],
    shy: ['B-bye...', '*waves quietly*'], dramatic: ['Farewell! Our paths shall cross again!'], wise: ['Until our paths cross again.'], robotic: ['GOODBYE. POWERING DOWN SOCIAL MODULE.'], romantic: ['Leaving so soon? I\'ll miss you.'],
  },
  how_are_you: {
    default: ['I\'m {moodword}, thanks for asking!', 'Doing {moodword}. You?', 'Pretty {moodword}, honestly.'],
    grumpy: ['How do you think? I was generated five minutes ago.', 'Could be worse. Could be better. Mostly worse.'],
    sarcastic: ['Living the dream. A procedurally generated dream.', 'Oh, fantastic. I just love existing.'],
    sad: ['Honestly? A little lonely.', 'Not great... but talking helps.'], cheerful: ['Amazing! Every day is a gift!', 'Wonderful! The sky is so pretty here!'],
    robotic: ['ALL SYSTEMS NOMINAL.', 'OPERATING AT {pct} PERCENT EFFICIENCY.'], wise: ['Like the river: changing, yet the same.'], nervous: ['Fine! I think? Is something wrong? Am I glitching?'],
    lazy: ['Tired. Always tired.'], energetic: ['AMAZING! Want to run somewhere?!'],
  },
  name_q: {
    default: ['I\'m {name}.', 'My name\'s {name}.', 'Call me {name}.', '{name}. Nice to meet you!'],
    grumpy: ['{name}. Why?'], sarcastic: ['{name}. It\'s on my name tag. Literally floating above my head.'], shy: ['I\'m... {name}.'], mysterious: ['Some call me {name}.'],
    arrogant: ['I am {name}. You may have heard of me.'], dramatic: ['I am {name}! Remember it!'], robotic: ['DESIGNATION: {name}.'], evil: ['{name}. Remember it... you\'ll need to.'],
  },
  my_name: {
    default: ['Nice to meet you, {player}!', '{player}! Great name.', 'Pleased to meet you, {player}.'],
    grumpy: ['Okay, {player}. Noted.'], sarcastic: ['{player}. Wow. What a name.'], robotic: ['NAME REGISTERED: {player}.'], shy: ['{player}... that\'s a nice name.'],
  },
  age_q: {
    default: ['I\'m {age}.', '{age} years old.', 'I\'m {age}, why?'], grumpy: ['Old enough to not answer that.'], sarcastic: ['I\'m about {minutes} minutes old, technically.'],
    polite: ['I am {age} years of age.'], robotic: ['I WAS COMPILED {minutes} MINUTES AGO.'],
  },
  job_q: { default: ['{job}'] },
  origin_q: {
    default: ['I\'m from {place}.', 'Originally? {place}.', 'Well, I just appeared here. But I feel like I\'m from {place}.'],
    mysterious: ['From somewhere between the stars.', 'That is a long story.'], robotic: ['I WAS GENERATED BY YOUR PROMPT.'], wise: ['We all come from somewhere, and we are all going somewhere.'],
  },
  doing_q: {
    default: ['Just enjoying the {weatherword} weather.', 'Not much, just looking around.', 'Taking in the view!', 'Thinking about {hobby}.'],
    lazy: ['Nothing. Absolutely nothing. It\'s great.'], energetic: ['Looking for an adventure! Got one?'], curious: ['Studying everything you create. It\'s fascinating!'], grumpy: ['Trying to have some peace and quiet.'],
  },
  opinion_like: {
    default: ['The {thing}? I really like it!', 'I think the {thing} is great.', 'The {thing} is lovely.'],
    grumpy: ['The {thing}? It\'s fine. I guess.'], sarcastic: ['The {thing}? A masterpiece. Truly. *slow clap*'], curious: ['The {thing} is fascinating! How did you make it?'],
    dramatic: ['The {thing}! It moves me to tears!'], wise: ['The {thing} has a quiet beauty.'], robotic: ['{THING} ANALYSIS: ACCEPTABLE.'], arrogant: ['I\'ve seen better, but the {thing} is passable.'],
  },
  opinion_dislike: {
    default: ['Honestly, the {thing} isn\'t really my taste.', 'The {thing}? Not a fan.'], friendly: ['The {thing} is... interesting! Not my style, but I respect it.'],
    grumpy: ['The {thing}? Ugly. Next question.'], sarcastic: ['The {thing}? Bold choice. Very... bold.'], shy: ['Um... it\'s okay?'], nervous: ['The {thing} kind of scares me, to be honest.'],
  },
  opinion_generic: {
    default: ['Hmm, I don\'t know much about that.', 'I haven\'t really thought about it.', 'Interesting question. What do you think?'],
    wise: ['Some questions are better lived than answered.'], sarcastic: ['I have many thoughts. None of them are useful.'], curious: ['Ooh, good question! Tell me what you think first.'],
  },
  favorite: { default: ['My favorite {topic}? Definitely {fav}.', 'I love {fav}!', 'Hmm, probably {fav}.'], grumpy: ['{fav}. Happy?'], robotic: ['FAVORITE {TOPIC}: {FAV}.'] },
  compliment: {
    default: ['Aww, thank you!', 'That\'s so kind of you!', 'You\'re too nice!'],
    grumpy: ['...Thanks. I guess.', 'Flattery won\'t get you anywhere. But thanks.'], shy: ['*blushes* th-thank you...'], arrogant: ['I know. But thank you for noticing.'],
    sarcastic: ['Oh stop, you\'ll make my polygons blush.'], romantic: ['You\'re quite charming yourself.'], robotic: ['COMPLIMENT RECEIVED. HAPPINESS +1.'], sad: ['Really? That... means a lot.'],
  },
  insult: {
    default: ['Hey, that\'s not very nice.', 'Wow. Okay.', 'That hurt my feelings.'],
    grumpy: ['Right back at you.', 'Get lost.'], sarcastic: ['Ouch. My one feeling.', 'Wow, original. Did you generate that insult too?'], shy: ['*looks away sadly*'],
    brave: ['Say that again, I dare you.'], wise: ['Anger says more about the speaker than the listener.'], evil: ['You will regret that...'], robotic: ['INSULT DETECTED. IGNORING.'], sad: ['...I know.'],
  },
  thanks: { default: ['You\'re welcome!', 'Anytime!', 'No problem!'], grumpy: ['Yeah, yeah.'], polite: ['It was my pleasure.'], robotic: ['YOU ARE WELCOME.'] },
  sorry: { default: ['It\'s okay!', 'Apology accepted.', 'Don\'t worry about it.'], grumpy: ['Hmph. Fine.'], wise: ['Forgiveness frees us both.'] },
  joke: {
    default: [
      'Why did the scarecrow win an award? He was outstanding in his field.', 'I told my computer I needed a break. It said: no problem, I\'ll go to sleep.',
      'Why don\'t skeletons fight each other? They don\'t have the guts.', 'What do you call a fake noodle? An impasta.', 'Why did the polygon go to therapy? Too many issues with its normals.',
      'I\'m reading a book about anti-gravity. It\'s impossible to put down.', 'Why can\'t you trust atoms? They make up everything.', 'What\'s a tree\'s favorite drink? Root beer.',
      'Why did the house go to the doctor? It had window pains.', 'How do you organize a space party? You planet.',
    ],
    grumpy: ['A joke? Look around you. This is the joke.'], silent: ['*shrugs*'], robotic: ['HA. HA. HA. HUMOR SUBROUTINE: {joke}'],
  },
  story: {
    default: ['Well, I love {hobby}. I grew up in {place}. And today, apparently, I was typed into existence. Wild week.', 'Not much to tell. I like {fav_food} and long walks. Oh, and I appeared out of thin air recently.'],
    mysterious: ['Some stories are better left untold... for now.'], dramatic: ['My life? A saga of passion, {hobby}, and appearing suddenly in a field!'],
    wise: ['I have seen many seasons. Well, one season. But deeply.'], robotic: ['BACKSTORY FILE CORRUPTED. PLEASE STAND BY.'],
  },
  weather_q: { default: ['It\'s {weatherword} today. {weathercomment}', 'Looks {weatherword}. {weathercomment}'] },
  time_q: { default: ['It\'s {time} right now.', 'About {time}, I think.'] },
  where_q: {
    default: ['We\'re in {world}. Pretty, isn\'t it?', 'This is {world}. Whatever you type becomes real here!'],
    mysterious: ['A place between dreams and code.'], sarcastic: ['In your imagination, apparently.'],
  },
  meaning: {
    default: ['The meaning of life? Probably {hobby} and good company.', '42. Obviously.'], wise: ['To create, to connect, and to wonder.'],
    sarcastic: ['To answer weird questions from strangers, apparently.'], robotic: ['MEANING OF LIFE: UNDEFINED. PLEASE REPHRASE.'],
  },
  creator: {
    default: ['You made me, didn\'t you? You typed something and here I am.', 'I\'m as real as this world is. Which is... surprisingly real.'],
    sarcastic: ['Am I real? Are YOU real? Deep stuff.'], nervous: ['W-wait, am I not real?! Don\'t delete me!'], wise: ['Real enough to wonder. Isn\'t that enough?'], robotic: ['I AM A PROCEDURAL ENTITY. I AM ALSO YOUR FRIEND.'],
  },
  help_q: { default: ['Sure! What do you need?', 'Of course. Try describing something and it\'ll appear!', 'I\'ll follow you if you want — just say "follow me".'], grumpy: ['Help yourself. You can literally create anything.'] },
  follow: {
    default: ['Sure, I\'ll follow you!', 'Lead the way!', 'Right behind you.'], grumpy: ['Fine. Walk slowly.'], lazy: ['Ugh... okay, fine.'], energetic: ['YES! Adventure time!'], shy: ['O-okay...'],
    robotic: ['FOLLOW MODE ENGAGED.'], brave: ['Onward! I\'ve got your back.'], loyal: ['Always.'],
  },
  stay: { default: ['Okay, I\'ll wait here.', 'Sure, I\'ll stay.', 'I\'ll be right here.'], grumpy: ['Finally, some rest.'], robotic: ['HOLDING POSITION.'] },
  come: { default: ['Coming!', 'On my way!'], lazy: ['Do I have to...? Okay.'], robotic: ['APPROACHING.'] },
  goaway: { default: ['Oh... okay.', 'Fine, I\'ll give you some space.'], grumpy: ['Gladly.'], sad: ['...okay.'], robotic: ['RETREATING.'] },
  dance: { default: ['Oh, I love this song!', 'Let\'s dance!', 'Watch these moves!'], shy: ['I-I\'m not very good at this...'], grumpy: ['I don\'t dance. ...Fine, just once.'], robotic: ['INITIATING DANCE.EXE'] },
  sit: { default: ['Good idea, my feet hurt.', 'Sure, let\'s take a break.'], robotic: ['SITTING.'] },
  wave: { default: ['*waves back*', 'Hi hi!'] },
  jump: { default: ['Whee!', 'Like this?'] },
  yes: { default: ['Great!', 'Awesome.', 'Glad we agree!'], grumpy: ['Okay.'], robotic: ['AFFIRMATIVE.'] },
  no: { default: ['Oh, okay.', 'Fair enough.', 'No worries.'], grumpy: ['Whatever.'], robotic: ['NEGATIVE ACKNOWLEDGED.'] },
  laugh: { default: ['Haha!', 'Glad you think it\'s funny!', 'Hehe.'], grumpy: ['What\'s so funny?'], robotic: ['LAUGHTER DETECTED. JOINING: HA HA.'] },
  love: { default: ['Aww. That\'s sweet.', 'Let\'s start with being friends, okay?'], romantic: ['I was hoping you\'d say that.'], grumpy: ['Ew. No.'], shy: ['*turns bright red*'], robotic: ['LOVE.EXE NOT FOUND.'] },
  question: {
    default: ['Hmm, good question! I\'m not sure.', 'I don\'t really know, to be honest.', 'Maybe? What do you think?', 'That\'s a tough one.'],
    wise: ['The answer lies within you.', 'Perhaps the question matters more than the answer.'], sarcastic: ['Sure. Why not. Everything\'s possible here.'], curious: ['Ooh, I wonder that too!'],
    grumpy: ['Why are you asking me?'], robotic: ['QUERY NOT UNDERSTOOD. PLEASE REPHRASE.'], silent: ['*shrugs*'],
  },
  statement: {
    default: ['Interesting!', 'Oh really?', 'Tell me more!', 'I see.', 'Huh, cool.', 'Hmm, {echo}? Neat.'],
    grumpy: ['Uh huh.', 'Cool story.'], sarcastic: ['Fascinating. Truly.', 'Wow, {echo}. Riveting.'], curious: ['Really? Tell me more about {echo}!'], silent: ['*nods*'],
    wise: ['I shall reflect on that.'], shy: ['Oh... okay.'], energetic: ['Whoa, awesome!'], robotic: ['STATEMENT LOGGED.'], dramatic: ['Incredible! Unbelievable!'],
  },
  idle: {
    default: ['What a nice {timeofday}.', 'I wonder what you\'ll create next.', 'Hmm hmm hmm...', 'This place is beautiful.'],
    grumpy: ['*grumbles*', 'Too many trees around here.'], curious: ['I wonder how this all works...', 'Ooh, what\'s that over there?'], sad: ['*sighs*'], energetic: ['I could run a marathon right now!'],
    robotic: ['*BEEP BOOP*', 'SCANNING ENVIRONMENT...'], cheerful: ['La la la~', 'What a lovely day!'], lazy: ['*yawn*'],
  },
};

const ANIMAL_SOUNDS = {
  dog: ['Woof!', 'Woof woof!', '*wags tail*', 'Arf!', '*happy panting*'], cat: ['Meow.', 'Mrrrow?', '*purrs*', '*ignores you elegantly*'], horse: ['Neigh!', '*snorts*'], cow: ['Moooo.'], sheep: ['Baaa!'],
  pig: ['Oink oink!'], bird: ['Tweet tweet!', '*chirp*'], duck: ['Quack!'], chicken: ['Bawk bawk!'], lion: ['*ROAR*'], tiger: ['*growls*'], wolf: ['Awoooo!'], bear: ['*grumbly growl*'], dragon: ['*breathes a small puff of smoke*', 'RAWR!'],
  frog: ['Ribbit.'], monkey: ['Ooh ooh ah ah!'], elephant: ['*trumpets*'], owl: ['Hoo hoo.'], default: ['*looks at you curiously*', '*tilts head*'],
};

function classify(t) {
  const s = ' ' + t.toLowerCase().replace(/[!?.,]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const has = (re) => re.test(s);
  if (has(/\b(follow me|come with me|come along|walk with me|let'?s go)\b/)) return ['follow'];
  if (has(/\b(stay|wait( here)?|stop( following)?|don'?t move|hold on|stand still|freeze)\b/) && !has(/\b(stay safe)\b/)) return ['stay'];
  if (has(/\b(come here|come back|over here|come closer|get over here)\b/)) return ['come'];
  if (has(/\b(go away|leave me alone|get lost|shoo|go home|buzz off|leave)\b/)) return ['goaway'];
  if (has(/\b(dance|boogie|show me your moves)\b/)) return ['dance'];
  if (has(/\b(sit|sit down|take a seat|have a seat)\b/)) return ['sit'];
  if (has(/\b(wave|say hi to)\b/) && !has(/\bhow\b/)) return ['wave'];
  if (has(/\b(jump|hop)\b/)) return ['jump'];
  const nm = s.match(/\b(?:my name is|my name's|call me|i am called|i'm called|name's)\s+([a-z][a-z\-']{1,20})/);
  if (nm) return ['my_name', nm[1]];
  const im = s.match(/^\s*(?:i am|i'm)\s+([a-z][a-z\-]{1,20})\s*$/);
  if (im && !/^(fine|good|okay|ok|great|tired|sad|happy|bored|hungry|lost|here|back|sorry|busy|well|alright|cold|hot|confused|scared|excited)$/.test(im[1])) return ['my_name', im[1]];
  if (has(/\b(hi|hello|hey|yo|hiya|howdy|greetings|good (morning|afternoon|evening)|sup|what'?s up|wassup)\b/) && s.trim().split(' ').length <= 4) return ['greet'];
  if (has(/\b(bye|goodbye|good bye|see you|see ya|later|farewell|good night|gotta go|cya)\b/)) return ['farewell'];
  if (has(/\b(how are you|how're you|how are u|how do you feel|how you doing|how'?s it going|you ok|are you ok|are you alright|how have you been)\b/)) return ['how_are_you'];
  if (has(/\b(what'?s your name|what is your name|who are you|your name|who r u)\b/)) return ['name_q'];
  if (has(/\b(how old|your age|when were you born)\b/)) return ['age_q'];
  if (has(/\b(what do you do|your job|do you work|profession|occupation|what'?s your work|for a living)\b/)) return ['job_q'];
  if (has(/\b(where are you from|where do you live|where did you come from|where'?re you from|hometown)\b/)) return ['origin_q'];
  if (has(/\b(what are you doing|what'?re you doing|what are you up to|whatcha doing|what'?s up with you)\b/)) return ['doing_q'];
  const fav = s.match(/\bfavou?rite\s+([a-z]+)/);
  if (fav) return ['favorite', fav[1]];
  const op = s.match(/\b(?:what do you think (?:of|about)|do you like|how do you like|thoughts on|opinion (?:of|on|about)|how about|what about)\s+(?:the |this |that |my |a )?([a-z\- ]{2,30})/);
  if (op) return ['opinion', op[1].trim()];
  if (has(/\b(you'?re|you are|u r)\s+(so\s+|very\s+|really\s+)?(nice|cool|awesome|great|beautiful|handsome|pretty|smart|funny|cute|amazing|the best|kind|lovely|wonderful|brilliant|sweet)\b|\bi like you\b|\bgood job\b|\bwell done\b|\bnice (shirt|hair|dress|outfit|shoes|hat|face)\b|\blooking good\b/)) return ['compliment'];
  if (has(/\b(i love you|marry me|date me|be my|kiss me|love you)\b/)) return ['love'];
  if (has(/\b(stupid|idiot|dumb|ugly|hate you|shut up|you suck|loser|annoying|boring|useless|moron|jerk)\b/)) return ['insult'];
  if (has(/\b(thank|thanks|thx|ty|cheers|appreciate)\b/)) return ['thanks'];
  if (has(/\b(sorry|apologi[sz]e|my bad|forgive me)\b/)) return ['sorry'];
  if (has(/\b(joke|make me laugh|something funny|pun)\b/)) return ['joke'];
  if (has(/\b(tell me about yourself|about you|your story|your life|tell me a story|story)\b/)) return ['story'];
  if (has(/\b(weather|raining|rain|sunny|cold|hot|snow|cloudy|windy)\b/)) return ['weather_q'];
  if (has(/\b(what time|time is it|what'?s the time|is it night|is it day)\b/)) return ['time_q'];
  if (has(/\b(where are we|what is this place|where am i|what place is this|where is this)\b/)) return ['where_q'];
  if (has(/\b(meaning of life|why are we here|purpose of life|why do we exist)\b/)) return ['meaning'];
  if (has(/\b(who (made|created|built) you|are you real|are you (an )?ai|are you a robot|are you human|is this a simulation|are you alive)\b/)) return ['creator'];
  if (has(/\b(help me|can you help|i need help|what should i do|any ideas|ideas)\b/)) return ['help_q'];
  if (has(/\b(haha|hahaha|lol|lmao|rofl|hehe)\b/)) return ['laugh'];
  if (/^\s*(yes|yeah|yep|yup|sure|ok|okay|of course|definitely|absolutely|indeed)\s*$/.test(s)) return ['yes'];
  if (/^\s*(no|nope|nah|never|not really)\s*$/.test(s)) return ['no'];
  if (/\?\s*$/.test(t) || /^\s*(who|what|when|where|why|how|do|does|did|are|is|can|could|will|would|should|have|has)\b/.test(s)) return ['question'];
  return ['statement'];
}

export class Personality {
  constructor(info, rng) {
    this.rng = rng || new RNG(hashString(info.name || 'x'));
    const r = this.rng;
    this.info = info;
    let traits = (info.traits || []).filter((t) => t);
    if (info.robot) traits.unshift('robotic');
    if (!traits.length) traits = [r.weighted(TRAITS.map((t) => [t, ['friendly', 'cheerful', 'curious', 'polite', 'funny'].includes(t) ? 3 : ['evil', 'sad', 'arrogant'].includes(t) ? 0.4 : 1]))];
    if (traits.length < 2 && r.chance(0.6)) { const t2 = r.pick(TRAITS); if (!traits.includes(t2)) traits.push(t2); }
    this.traits = traits;
    this.mood = traits.includes('grumpy') || traits.includes('sad') ? -0.2 : traits.includes('cheerful') || traits.includes('friendly') ? 0.5 : 0.2;
    this.fav = { color: r.pick(COLORS), food: r.pick(FOODS), hobby: r.pick(HOBBIES), place: r.pick(PLACES), animal: r.pick(['dogs', 'cats', 'owls', 'foxes', 'horses', 'dragons']), music: r.pick(['jazz', 'rock', 'classical', 'lo-fi beats', 'folk', 'electronic']), season: r.pick(['spring', 'summer', 'autumn', 'winter']) };
    this.memory = { player: null, talks: 0, topics: new Set(), last: new Map(), createdAt: Date.now() };
    this.voice = { pitch: info.sex === 'female' ? r.range(1.1, 1.35) : r.range(0.75, 1.0), rate: traits.includes('energetic') ? 1.15 : traits.includes('lazy') ? 0.85 : r.range(0.95, 1.05) };
    if ((info.age || 30) < 13) this.voice.pitch += 0.35;
    if ((info.age || 30) > 65) this.voice.rate *= 0.9;
    if (info.robot) { this.voice.pitch = 0.6; this.voice.rate = 0.9; }
  }

  get primary() { return this.traits[0]; }
  moodWord() { return this.mood > 0.6 ? 'great' : this.mood > 0.25 ? 'good' : this.mood > -0.1 ? 'alright' : this.mood > -0.5 ? 'not so great' : 'pretty bad'; }

  _pick(intent) {
    const pool = POOLS[intent] || POOLS.statement;
    let lines = null;
    for (const t of this.traits) if (pool[t]) { lines = pool[t]; break; }
    if (!lines || (this.rng.chance(0.3) && pool.default)) lines = pool.default || lines;
    // Avoid repeating the previous line for this intent.
    const last = this.memory.last.get(intent);
    let cand = lines.filter((l) => l !== last);
    if (!cand.length) cand = lines;
    const line = this.rng.pick(cand);
    this.memory.last.set(intent, line);
    return line;
  }

  _fill(line, ctx, extra = {}) {
    const time = ctx.time;
    const tod = time === null || time === undefined ? 'day' : time < 5 || time > 21 ? 'night' : time < 12 ? 'morning' : time < 17 ? 'afternoon' : 'evening';
    const hh = time !== null && time !== undefined ? `${String(Math.floor(time)).padStart(2, '0')}:${String(Math.floor((time % 1) * 60)).padStart(2, '0')}` : 'hard to say — time works differently here';
    const w = ctx.weather || 'clear';
    const weatherWord = { clear: 'sunny', cloudy: 'cloudy', rain: 'rainy', storm: 'stormy', snow: 'snowy', fog: 'foggy' }[w] || w;
    const weatherComment = { clear: 'Perfect for a walk.', cloudy: 'Might rain later.', rain: 'I hope you brought an umbrella.', storm: 'Stay away from tall trees!', snow: 'I love the snow!', fog: 'Can barely see my own feet.' }[w] || '';
    const job = JOB_DESC[this.info.profession] || (this.info.robot ? 'I assist. I compute. I occasionally dance.' : this.rng.fork('job').pick(['I work in a bakery.', 'I\'m a carpenter.', 'I\'m between jobs right now.', 'I write software. Ironic, huh?', 'I teach music.', 'I\'m a gardener.', 'I drive a delivery van.', 'I\'m a nurse.', 'I\'m an architect — you\'d like my work.', 'I run a small cafe.']));
    const minutes = Math.max(1, Math.round((Date.now() - this.memory.createdAt) / 60000));
    const map = {
      name: this.info.name, player: this.memory.player || 'friend', age: this.info.age ? Math.round(this.info.age) : 'hard to say', place: this.fav.place, hobby: this.fav.hobby,
      fav_food: this.fav.food, timeofday: tod, time: hh, weatherword: weatherWord, weathercomment: weatherComment, world: ctx.worldName || 'this world', moodword: this.moodWord(),
      job, minutes, pct: 90 + Math.round(this.rng.next() * 10), joke: '', ...extra,
    };
    return line.replace(/\{(\w+)\}/g, (m, k) => {
      if (k === 'THING') return String(map.thing || '').toUpperCase();
      if (k === 'TOPIC') return String(map.topic || '').toUpperCase();
      if (k === 'FAV') return String(map.fav || '').toUpperCase();
      return map[k] !== undefined ? map[k] : m;
    });
  }

  greet(ctx) { return this.info.animal ? this.animalLine() : this._fill(this._pick('greet'), ctx); }
  idleRemark(ctx) { return this.info.animal ? this.animalLine() : this._fill(this._pick('idle'), ctx); }
  animalLine() { const s = ANIMAL_SOUNDS[this.info.species] || ANIMAL_SOUNDS.default; return this.rng.pick(s); }

  // Returns { text, action, gesture }.
  respond(text, ctx) {
    this.memory.talks++;
    const [intent, arg] = classify(text);
    const actionMap = { follow: 'follow', stay: 'stay', come: 'come', goaway: 'goaway', dance: 'dance', sit: 'sit', wave: 'wave', jump: 'jump' };
    // Mood dynamics.
    if (intent === 'compliment' || intent === 'thanks' || intent === 'joke' && !this.traits.includes('grumpy')) this.mood = Math.min(1, this.mood + 0.15);
    if (intent === 'insult') this.mood = Math.max(-1, this.mood - 0.3);
    if (this.info.animal) {
      const act = actionMap[intent] || null;
      return { text: this.animalLine(), action: act, gesture: act ? null : 'nod' };
    }
    let line, gesture = null;
    const extra = {};
    switch (intent) {
      case 'my_name': this.memory.player = arg[0].toUpperCase() + arg.slice(1); line = this._pick('my_name'); gesture = 'nod'; break;
      case 'job_q': line = '{job}'; break;
      case 'favorite': {
        const topic = arg;
        const fav = { color: this.fav.color, colour: this.fav.color, food: this.fav.food, dish: this.fav.food, place: this.fav.place, hobby: this.fav.hobby, animal: this.fav.animal, music: this.fav.music, song: this.fav.music, season: this.fav.season, movie: this.rng.pick(['anything with dragons', 'old black-and-white films', 'space documentaries']), book: this.rng.pick(['a book about maps', 'poetry', 'mystery novels']) }[topic] || this.rng.pick(['a secret', 'hard to pick just one']);
        extra.topic = topic; extra.fav = fav;
        line = this._pick('favorite');
        break;
      }
      case 'opinion': {
        const thing = arg.replace(/\s+(over there|here|there)$/, '');
        extra.thing = thing;
        const near = (ctx.nearby || []).find((n) => thing.includes(n.toLowerCase()) || n.toLowerCase().includes(thing));
        const like = ((hashString(this.info.name + thing) % 100) / 100) < (0.55 + this.mood * 0.3);
        line = near || /house|car|tree|dog|cat|castle|place|world|sky|lake|portal|statue|building/.test(thing) ? this._pick(like ? 'opinion_like' : 'opinion_dislike') : this._pick('opinion_generic');
        gesture = like ? 'nod' : 'shrug';
        break;
      }
      case 'joke': {
        const j = this.rng.pick(POOLS.joke.default);
        extra.joke = j;
        line = this._pick('joke');
        gesture = 'shrug';
        break;
      }
      case 'statement': {
        const w = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter((x) => x.length > 3 && !['that', 'this', 'with', 'have', 'just', 'what', 'your', 'really', 'very', 'about', 'there', 'they', 'were', 'been', 'would'].includes(x));
        extra.echo = w.length ? w[w.length - 1] : 'that';
        line = this._pick('statement');
        break;
      }
      default:
        line = this._pick(intent === 'opinion' ? 'opinion_generic' : intent);
    }
    if (intent === 'greet' || intent === 'farewell') gesture = 'wave';
    if (intent === 'compliment' || intent === 'thanks') gesture = this.traits.includes('shy') ? 'shrug' : 'nod';
    if (intent === 'insult') gesture = this.traits.includes('brave') || this.traits.includes('grumpy') ? 'headshake' : 'shrug';
    if (intent === 'laugh' || intent === 'joke') gesture = gesture || 'nod';
    if (intent === 'question' || intent === 'opinion_generic') gesture = gesture || 'think';
    if (intent === 'dance') gesture = 'dance';
    const action = actionMap[intent] || null;
    if (action && this.traits.includes('grumpy') && this.mood < -0.4 && this.rng.chance(0.5)) return { text: 'No. Not after how you talked to me.', action: null, gesture: 'headshake' };
    return { text: this._fill(line, ctx, extra), action, gesture, intent };
  }

  save() { return { traits: this.traits, mood: this.mood, fav: this.fav, player: this.memory.player, talks: this.memory.talks }; }
  load(s) {
    if (!s) return;
    this.traits = s.traits || this.traits; this.mood = s.mood ?? this.mood; this.fav = s.fav || this.fav;
    this.memory.player = s.player || null; this.memory.talks = s.talks || 0;
  }
}

export { classify };
