// ---------------------------------------------------------------------------
// Extended vocabulary: several hundred more nouns routed to the object,
// ride, civic, landmark, creature, bird and fish generators. Entries marked
// `o` (override) take precedence over older, coarser mappings (e.g. "clock
// tower" used to mean a wall clock, "hippo" a rhino, "spider" a dog).
// Rows: [id, 'comma, separated, phrases', params, override]
// ---------------------------------------------------------------------------

const rows = (gen, cat, icon, list, key = 'kind') => list.map(([id, words, p, o]) => ({
  id, cat, gen, icon, r: 1, p: typeof p === 'object' && p ? p : { [key]: id }, o: !!o || p === true,
  words: words.split(/\s*,\s*/).filter(Boolean),
}));

const GADGETS = rows('gadget', 'object', '📦', [
  ['toaster', 'toaster'], ['microwave', 'microwave, microwave oven'], ['washer', 'washing machine, washer, dryer, tumble dryer, laundry machine'],
  ['dishwasher', 'dishwasher'], ['oven', 'oven, stove, cooker, kitchen stove'], ['blender', 'blender, smoothie maker'], ['kettle', 'kettle, teakettle, tea kettle'],
  ['coffeeMachine', 'coffee machine, coffee maker, espresso machine'], ['mixer', 'stand mixer, food mixer, mixer'], ['vacuum', 'vacuum cleaner, vacuum, hoover'],
  ['robotVacuum', 'robot vacuum, roomba'], ['fan', 'electric fan, desk fan, fan'], ['ceilingFan', 'ceiling fan'], ['airConditioner', 'air conditioner, ac unit, aircon'],
  ['radiator', 'radiator, heater'], ['sewingMachine', 'sewing machine'], ['laptop', 'laptop, notebook computer, macbook', null, true], ['computer', 'computer, pc, desktop computer, gaming pc, workstation', null, true],
  ['monitor', 'monitor, computer monitor'], ['tv', 'television, tv, flat screen tv, flatscreen', null, true], ['oldTv', 'old tv, retro tv, crt tv, old television, vintage tv'],
  ['gameConsole', 'game console, video game console, playstation, xbox, nintendo, console'], ['arcade', 'arcade machine, arcade cabinet, arcade game, pinball machine'],
  ['vendingMachine', 'vending machine, soda machine, snack machine'], ['atm', 'atm, cash machine, cashpoint'], ['radio', 'radio, transistor radio'],
  ['boombox', 'boombox, ghetto blaster, stereo'], ['speaker', 'speaker, loudspeaker, subwoofer'], ['turntable', 'record player, turntable, gramophone, phonograph, vinyl player'],
  ['camera', 'camera, photo camera, dslr'], ['videoCamera', 'video camera, film camera, camcorder, movie camera'], ['microphone', 'microphone, mic, microphone stand'],
  ['headphones', 'headphones, headset, earphones'], ['printer', 'printer'], ['printer3d', '3d printer'], ['serverRack', 'server rack, server, supercomputer, mainframe'],
  ['phoneBooth', 'phone booth, telephone booth, phone box, telephone box, tardis, police box'], ['trafficLight', 'traffic light, traffic lights, stoplight, traffic signal', null, true],
  ['busStop', 'bus stop, bus shelter', null, true], ['hydrant', 'fire hydrant, hydrant', null, true], ['parkingMeter', 'parking meter'],
  ['trashCan', 'trash can, garbage can, dustbin, wastebasket, trashcan, rubbish bin, bin'], ['dumpster', 'dumpster, skip bin'], ['trafficCone', 'traffic cone, road cone'],
  ['stopSign', 'stop sign'], ['billboard', 'billboard, advertisement board, advert'], ['neonSign', 'neon sign'], ['toilet', 'toilet, loo, lavatory'], ['sink', 'sink, washbasin'],
  ['shower', 'shower, shower cabin'], ['hotTub', 'hot tub, jacuzzi'], ['deskLamp', 'desk lamp, reading lamp'], ['lavaLamp', 'lava lamp'], ['safe', 'safe, strongbox, vault door'],
  ['filingCabinet', 'filing cabinet, file cabinet'], ['whiteboard', 'whiteboard, blackboard, chalkboard'],
  ['teddyBear', 'teddy bear, teddy, plush bear, stuffed animal, plushie, soft toy, stuffed bear', null, true], ['rubberDuck', 'rubber duck, rubber ducky, bath duck', null, true],
  ['piggyBank', 'piggy bank', null, true], ['toyBlocks', 'toy blocks, building blocks, alphabet blocks, blocks'], ['rockingHorse', 'rocking horse', null, true], ['kite', 'kite'],
  ['spinningTop', 'spinning top'], ['dice', 'dice, pair of dice'], ['rubiksCube', "rubik's cube, rubiks cube, puzzle cube"], ['chessPiece', 'chess piece, pawn, rook, chess king, chess queen, chess knight, chess bishop'],
  ['chessSet', 'chess set, chessboard, chess board, chess', null, true], ['jackInTheBox', 'jack in the box, jack-in-the-box'], ['toyTrain', 'toy train, train set, model train', null, true],
  ['snowGlobe', 'snow globe, snowglobe'], ['pinata', 'pinata, piñata'], ['poolTable', 'pool table, billiard table, snooker table, billiards'],
  ['pingPong', 'ping pong table, table tennis table, ping-pong table, table tennis'], ['foosball', 'foosball table, foosball, table football'],
  ['basketballHoop', 'basketball hoop, basketball net'], ['soccerGoal', 'soccer goal, football goal, goal post, goalpost, goal'], ['bowling', 'bowling pins, bowling, skittles'],
  ['dartboard', 'dartboard, darts, dart board'], ['surfboard', 'surfboard, surf board'], ['skis', 'skis, ski'], ['sled', 'sled, sledge, toboggan'],
  ['drumKit', 'drum kit, drums, drum set, drum'], ['violin', 'violin, fiddle, viola, cello, double bass, contrabass'], ['trumpet', 'trumpet, bugle, cornet, trombone, tuba, french horn'],
  ['saxophone', 'saxophone, sax, clarinet, oboe'], ['flute', 'flute, recorder, piccolo'], ['harp', 'harp, lyre'], ['xylophone', 'xylophone, glockenspiel, marimba'],
  ['synthesizer', 'synthesizer, synth, keytar, electric keyboard, keyboard instrument'], ['magicWand', 'magic wand, wand'], ['wizardStaff', 'wizard staff, magic staff, staff, sceptre, scepter'],
  ['crystalBall', 'crystal ball, fortune ball'], ['cauldron', 'cauldron, witch pot'], ['potions', 'potion, potions, potion bottle, elixir, magic potion'], ['crown', 'crown, tiara, diadem'],
  ['throne', 'throne', null, true], ['treasure', 'treasure, pile of gold, gold coins, hoard, treasure pile, pile of treasure, coins, gold bar, gold bars, ingot, ingots'], ['hourglass', 'hourglass, sand timer, egg timer'],
  ['lantern', 'lantern, oil lamp'], ['candles', 'candelabra, candle, candles, candlestick'], ['skull', 'skull', null, true], ['skeleton', 'skeleton, bones', null, true],
  ['coffin', 'coffin, casket, sarcophagus'], ['totemPole', 'totem pole, totem'], ['dreamcatcher', 'dreamcatcher, dream catcher'], ['altar', 'altar, shrine'], ['obelisk', 'obelisk'],
  ['idol', 'idol, golden idol'], ['orb', 'orb, magic orb, glowing orb, energy orb, power orb'], ['runestone', 'runestone, rune stone, standing stone'],
  ['magicCircle', 'magic circle, summoning circle, pentagram, rune circle'], ['grail', 'holy grail, grail, goblet, chalice'],
  ['bow', 'bow and arrow, bow and arrows, longbow, bow, arrows, quiver'], ['crossbow', 'crossbow'], ['shield', 'shield'], ['spear', 'spear, lance, trident, javelin, halberd'],
  ['battleAxe', 'battle axe, battleaxe, war axe, axe'], ['mace', 'mace, morning star, flail'], ['warHammer', 'war hammer, warhammer, thor hammer, mjolnir'], ['dagger', 'dagger, knife, kunai'],
  ['pistol', 'pistol, gun, handgun, revolver, ray gun, raygun, blaster, laser gun, water gun, toy gun, nerf gun, laser blaster'], ['rifle', 'rifle, shotgun, sniper rifle, musket, machine gun'],
  ['cannon', 'cannon'], ['catapult', 'catapult'], ['trebuchet', 'trebuchet'], ['bomb', 'bomb, cartoon bomb, dynamite'], ['boomerang', 'boomerang'],
  ['vase', 'vase, urn'], ['bottle', 'bottle, wine bottle, message in a bottle'], ['jar', 'jar, honey jar, cookie jar, jam jar'], ['basket', 'basket, picnic basket, fruit basket'],
  ['suitcase', 'suitcase, luggage, briefcase'], ['backpack', 'backpack, rucksack, school bag, bag'], ['bucket', 'bucket, pail'], ['wateringCan', 'watering can'],
  ['cooler', 'cooler, ice box, cool box'], ['birdhouse', 'birdhouse, bird house, bird feeder, nest box'], ['doghouse', 'doghouse, dog house, kennel', null, true],
  ['bell', 'bell, church bell, liberty bell'], ['gong', 'gong'], ['sundial', 'sundial'], ['weatherVane', 'weather vane, weathervane'],
  ['grandfatherClock', 'grandfather clock, pendulum clock, longcase clock'], ['ladder', 'ladder, stepladder'], ['wheelbarrow', 'wheelbarrow'], ['anvil', 'anvil'],
  ['workbench', 'workbench, work bench, tool bench'], ['toolbox', 'toolbox, tool box, tool kit'], ['shovel', 'shovel, spade'], ['pickaxe', 'pickaxe, pick axe'],
  ['hammer', 'hammer, mallet, sledgehammer'], ['wrench', 'wrench, spanner'], ['saw', 'saw, handsaw'], ['chainsaw', 'chainsaw'], ['drill', 'drill, power drill'],
  ['lawnMower', 'lawn mower, lawnmower, mower'], ['telescope', 'telescope', null, true], ['microscope', 'microscope', null, true], ['satellite', 'satellite, space probe, sputnik'],
  ['satelliteDish', 'satellite dish, radar dish, radio telescope, radar'], ['radioTower', 'radio tower, antenna tower, transmission tower, cell tower, communication tower, antenna'],
  ['solarPanel', 'solar panel, solar panels, solar array'], ['windTurbine', 'wind turbine, wind turbines, turbine', null, true], ['jetpack', 'jetpack, jet pack, rocket pack'],
  ['hoverboard', 'hoverboard, hover board', null, true], ['timeMachine', 'time machine'], ['teleporter', 'teleporter, teleport pad, transporter pad, transporter'],
  ['reactor', 'reactor, nuclear reactor, arc reactor, fusion reactor, power core, energy core'], ['generator', 'generator, power generator, steam engine, engine, motor'],
  ['teslaCoil', 'tesla coil, lightning machine'], ['robotArm', 'robot arm, robotic arm, industrial robot'], ['quantumComputer', 'quantum computer', null, true],
  ['lightsaber', 'lightsaber, light saber, energy sword, laser sword, beam sword, plasma sword', null, true], ['pumpjack', 'oil pump, pumpjack, oil rig, oil well, nodding donkey'],
  ['crane', 'construction crane, tower crane, crane'], ['calculator', 'calculator'], ['cashRegister', 'cash register, till'], ['magnifier', 'magnifying glass, magnifier'],
  ['compass', 'compass'], ['scroll', 'scroll, treasure map, map, parchment, ancient map', null, true],
]);

// Food, stalls and everything else (gadgets_food.js / gadgets_misc.js).
const FOODS = rows('gadget', 'object', '🍍', [
  ['pineapple', 'pineapple, pineapples, ananas'], ['banana', 'banana, bananas, bunch of bananas, plantain'], ['apple', 'apple, apples, green apple, red apple'],
  ['orange', 'orange, oranges, lemon, lemons, lime, limes, grapefruit, tangerine, mandarin, clementine, peach, peaches, apricot, plum, coconut'],
  ['pear', 'pear, pears'], ['cherries', 'cherry, cherries'], ['grapes', 'grapes, grape, bunch of grapes'], ['strawberry', 'strawberry, strawberries, raspberry, berry, berries'],
  ['watermelon', 'watermelon, melon, cantaloupe'], ['pumpkin', 'pumpkin, pumpkins, jack o lantern, jack-o-lantern, jack o\'lantern, squash, gourd'], ['carrot', 'carrot, carrots, parsnip'],
  ['corn', 'corn, corn on the cob, maize, corncob'], ['bread', 'bread, loaf, loaf of bread, baguette, french bread, sourdough'], ['croissant', 'croissant, croissants'],
  ['cake', 'cake, birthday cake, wedding cake, chocolate cake, cheesecake, cheese cake, gateau'], ['cupcake', 'cupcake, cupcakes, muffin, muffins'],
  ['donut', 'donut, doughnut, donuts, doughnuts'], ['cookie', 'cookie, cookies, biscuit, biscuits'], ['pie', 'pie, apple pie, tart, pumpkin pie, cherry pie'],
  ['pancakes', 'pancakes, pancake, stack of pancakes, waffles, waffle, crepe'], ['pizza', 'pizza, pizzas, pepperoni pizza, margherita'], ['burger', 'burger, hamburger, cheeseburger, big mac, whopper'],
  ['hotdog', 'hot dog, hotdog, sausage, bratwurst, corn dog'], ['sandwich', 'sandwich, sub sandwich, sandwiches, blt, club sandwich, toastie, panini'], ['taco', 'taco, tacos, burrito, quesadilla, enchilada'],
  ['sushi', 'sushi, sushi platter, maki, nigiri, sashimi'], ['ramen', 'ramen, noodles, bowl of noodles, pho, soup, bowl of soup, spaghetti, pasta'],
  ['fries', 'fries, french fries, chips, frites'], ['turkey', 'roast turkey, turkey dinner, roast chicken, thanksgiving turkey, roast'],
  ['egg', 'egg, eggs, fried egg, easter egg, painted egg, chicken egg'], ['cheese', 'cheese, cheese wheel, wheel of cheese, cheese wedge, cheddar, swiss cheese'],
  ['iceCream', 'ice cream, ice cream cone, gelato, sundae, soft serve, popsicle'], ['milkshake', 'milkshake, milk shake, smoothie, frappuccino'],
  ['popcorn', 'popcorn, bucket of popcorn'], ['soda', 'soda, soda can, coke, cola, can of soda, energy drink, beer can'],
  ['lollipop', 'lollipop, lolly, sucker'], ['candyCane', 'candy cane, candy canes'], ['chocolate', 'chocolate, chocolate bar, candy bar'], ['candy', 'candy, sweet, sweets, bonbon, toffee'],
  ['gummyBear', 'gummy bear, gummy bears, gummi bear, jelly bean, gummy'], ['cottonCandy', 'cotton candy, candy floss, candyfloss, fairy floss'], ['mushroomFood', 'button mushroom, champignon'],
  ['stall', 'stall, market stall, stand, food stand, hot dog stand, hot dog cart, lemonade stand, fruit stand, fruit stall, food stall, food cart, ice cream cart, ice cream stand, ticket booth, box office, kiosk, coffee kiosk, coffee stand, newsstand, flower stall, taco stand, souvenir stall, market stand, vendor stall, booth'],
]);
const MISCS = rows('gadget', 'object', '🎲', [
  ['guillotine', 'guillotine'], ['gallows', 'gallows, gibbet'], ['stocks', 'stocks, pillory'],
  ['tornado', 'tornado, twister, whirlwind, hurricane, cyclone, typhoon, dust devil, waterspout, fire tornado, firenado, vortex storm'],
  ['court', 'tennis court, basketball court, volleyball court, football pitch, soccer field, football field, soccer pitch, sports field, court'],
  ['raceTrack', 'race track, racetrack, racing track, race circuit, speedway, formula one track, f1 track, oval track'], ['golfCourse', 'golf course, golf hole, putting green, mini golf, crazy golf'],
  ['maze', 'maze, hedge maze, labyrinth, corn maze, haunted maze, stone maze'],
  ['planet', 'planet, earth, the earth, planet earth, mars, jupiter, saturn, neptune, uranus, venus, mercury, pluto, gas giant, exoplanet, planet with rings, ringed planet'],
  ['moon', 'moon, the moon, cheese moon, full moon'], ['star', 'star, shooting star, gold star, lucky star'], ['meteor', 'meteor, meteorite, asteroid, comet'],
  ['goldNugget', 'gold nugget, nugget, silver nugget, ore'], ['atom', 'atom, atomic model, molecule'], ['dna', 'dna, dna helix, double helix'],
  ['heart', 'heart, love heart, valentine heart, human heart'], ['brain', 'brain, human brain'], ['tooth', 'tooth, molar, teeth'],
  ['slotMachine', 'slot machine, fruit machine, one armed bandit'], ['roulette', 'roulette, roulette table, roulette wheel'], ['pokerTable', 'poker table, card table, blackjack table'],
  ['jukebox', 'jukebox, juke box'], ['discoBall', 'disco ball, mirror ball, glitter ball'], ['chandelier', 'chandelier'], ['menorah', 'menorah, hanukkah menorah, candelabrum'],
  ['giftBox', 'present, gift, gift box, present box, christmas present, birthday present'], ['balloonBunch', 'bunch of balloons, balloons, party balloons, helium balloon'],
  ['seashell', 'seashell, sea shell, shell, conch, conch shell, scallop shell'], ['pearl', 'pearl, oyster, clam, oyster with a pearl'],
  ['beehive', 'beehive, bee hive, hive, bee skep'], ['spiderWeb', 'spider web, spiderweb, cobweb, web'], ['birdNest', 'bird nest, birds nest, nest'],
  ['fishTank', 'fish tank, aquarium, fishbowl, fish bowl'], ['hamsterCage', 'hamster cage, pet cage, hamster wheel'], ['petBed', 'dog bed, cat bed, pet bed'],
  ['catTree', 'cat tree, scratching post, cat tower'], ['djBooth', 'dj booth, dj decks, dj table, turntables, dj set'], ['logPile', 'log pile, pile of logs, firewood, woodpile, logs'],
  ['silo', 'silo, grain silo, farm silo'], ['scarecrow', 'scarecrow, scarecrows'], ['gingerbreadMan', 'gingerbread man, gingerbread cookie, gingerbread'],
  ['witchHat', 'witch hat, witches hat, wizard hat'], ['broom', 'broom, broomstick, flying broom, witch broom, magic broom'], ['magicCarpet', 'magic carpet, flying carpet'],
  ['swordInStone', 'sword in the stone, sword in stone, excalibur'], ['dragonEgg', 'dragon egg, dragon eggs'],
  ['sportsGear', 'tennis racket, racket, racquet, badminton racket, baseball bat, cricket bat, golf club, hockey stick'], ['yoyo', 'yo-yo, yoyo, yo yo'],
  ['bbq', 'bbq, barbecue, barbeque, bbq grill, grill, barbecue grill'], ['geyser', 'geyser, hot spring, onsen'], ['iceberg', 'iceberg, glacier, ice floe'],
  ['moai', 'moai, easter island head, easter island statue, stone head'], ['flytrap', 'venus flytrap, flytrap, carnivorous plant, man eating plant, man-eating plant, piranha plant'],
  ['anthill', 'anthill, ant hill, ant colony, ant farm, termite mound'], ['paperPlane', 'paper airplane, paper plane, paper aeroplane, paper boat, paper crane, origami, origami crane'],
  ['gymEquipment', 'gym, home gym, fitness center, workout room, dumbbell, dumbbells, barbell, weights, treadmill, weight bench'],
  ['star', 'sun, the sun with sunglasses'], ['planet', 'death star'], ['meteor', 'meteor shower, shooting stars'],
  ['computer', 'gaming setup, gaming pc, battle station, gaming rig'],
  ['windTurbine', 'wind farm'], ['solarPanel', 'solar farm'],
  ['wheelchair', 'wheelchair, wheel chair'], ['shoppingCart', 'shopping cart, shopping trolley'], ['stroller', 'stroller, baby stroller, pram, pushchair, baby buggy'],
]);

// Generic object archetypes (the composer designs something to match).
const ARCHETYPES = rows('gadget', 'object', '⚙️', [
  ['machine', 'machine, device, contraption, gadget, apparatus, invention, doomsday device, flux capacitor, gizmo, widget, thingamajig, doohickey, mechanism, robot machine', { arche: 'machine' }],
  ['relic', 'artifact, artefact, relic, amulet, talisman, charm, trinket, medallion, necklace, magic ring, power stone, infinity stone, philosophers stone, magic stone, golden egg, fossil, mask', { arche: 'relic' }],
  ['toy', 'toy, action figure, doll, puppet, stuffed toy, figurine', { arche: 'toy' }],
  ['weapon', 'weapon, blade, magic sword, cursed sword', { arche: 'weapon' }],
  ['tool', 'tool, utensil, implement', { arche: 'tool' }],
  ['container', 'container, jar of, tin, canister, flask, vessel, casket, coffer', { arche: 'container' }],
]);

const RIDES = rows('ride', 'structure', '🎡', [
  ['ferrisWheel', 'ferris wheel, big wheel, observation wheel, london eye', null, true], ['carousel', 'carousel, merry-go-round, merry go round, carrousel', null, true],
  ['rollerCoaster', 'roller coaster, rollercoaster, coaster', null, true], ['dropTower', 'drop tower, free fall tower, freefall ride, tower of terror'],
  ['swingRide', 'swing ride, chair swing ride, wave swinger, chairoplane'], ['trampoline', 'trampoline', null, true],
]);

const CIVIC = rows('civic', 'building', '🏛️', [
  ['hospital', 'hospital, clinic, medical center, infirmary', null, true], ['school', 'school, schoolhouse, academy, elementary school, high school, college, university', null, true],
  ['police', 'police station, police department, precinct', null, true], ['fireStation', 'fire station, firehouse, fire department', null, true], ['library', 'library', null, true],
  ['museum', 'museum, art gallery, gallery'], ['bank', 'bank'], ['cityHall', 'city hall, town hall, government building, parliament, senate'], ['courthouse', 'courthouse, court house'],
  ['postOffice', 'post office'], ['capitol', 'capitol, capitol building, white house'], ['hotel', 'hotel, motel, inn'], ['casino', 'casino, las vegas casino, gambling hall', { kind: 'cinema', sign: 'CASINO', marquee: 'JACKPOT TONIGHT' }],
  ['apartment', 'apartment building, apartment block, apartments, flats, tenement, condo, condominium, block of flats, apartment'],
  ['factory', 'factory, manufacturing plant, steel mill, foundry'], ['warehouse', 'warehouse, storehouse, depot, storage building'],
  ['powerPlant', 'power plant, power station, nuclear power plant, nuclear plant'], ['trainStation', 'train station, railway station, railroad station, subway station, metro station, station', null, true],
  ['airport', 'airport, airfield, runway, air terminal'], ['gasStation', 'gas station, petrol station, filling station, fuel station, service station', null, true],
  ['supermarket', 'supermarket, grocery store, shopping mall, mall, department store, hypermarket'], ['cinema', 'cinema, movie theater, movie theatre, theater, theatre, opera, movie house'],
  ['stadium', 'stadium, arena, sports arena, football stadium, soccer stadium, ballpark', null, true], ['prison', 'prison, jail, penitentiary'], ['observatory', 'observatory, planetarium'],
  ['lab', 'laboratory, lab, research lab, research facility, science lab'], ['waterTower', 'water tower'], ['hangar', 'hangar, aircraft hangar'], ['bunker', 'bunker, pillbox'],
  ['garage', 'garage, carport'], ['parkingGarage', 'parking garage, car park, multi-storey car park, parking structure'], ['mosque', 'mosque'], ['palace', 'palace, kremlin, the kremlin, royal palace, chateau'],
  ['circusTent', 'circus, circus tent, big top'],
]);

const LANDMARKS = rows('landmark', 'landmark', '🗼', [
  ['eiffel', 'eiffel tower', null, true], ['bigBen', 'big ben, clock tower, elizabeth tower', null, true], ['colosseum', 'colosseum, coliseum, amphitheater, amphitheatre, roman arena'],
  ['liberty', 'statue of liberty, lady liberty', null, true], ['tajMahal', 'taj mahal'], ['pisa', 'leaning tower of pisa, leaning tower, tower of pisa'],
  ['greatWall', 'great wall of china, great wall'], ['arcDeTriomphe', 'arc de triomphe, triumphal arch'], ['operaHouse', 'sydney opera house, opera house'],
  ['goldenGate', 'golden gate bridge, golden gate, suspension bridge'], ['sphinx', 'great sphinx, sphinx', null, true],
]);

const SPECIES = rows('creature', 'animal', '🐾', [
  ['spider', 'spider, spiders', null, true], ['tarantula', 'tarantula'], ['ant', 'ant, ants', null, true], ['scorpion', 'scorpion', null, true], ['crab', 'crab, crabs', null, true],
  ['lobster', 'lobster, crayfish, crawfish'], ['beetle', 'beetle, bug, scarab'], ['ladybug', 'ladybug, ladybird'], ['bee', 'bee, bumblebee, honeybee', null, true], ['wasp', 'wasp, hornet'],
  ['seal', 'seal, sea lion'], ['walrus', 'walrus'],
  ['godzilla', 'godzilla, kaiju, giant lizard monster, behemoth, colossus'], ['kingkong', 'king kong, kong, giant ape, giant gorilla'], ['mammoth', 'mammoth, woolly mammoth, mastodon'],
  ['wolverine', 'wolverine'], ['badger', 'badger, honey badger'], ['skunk', 'skunk, polecat'], ['weasel', 'weasel, ferret, stoat, mink, ermine, mongoose'],
  ['meerkat', 'meerkat, prairie dog'], ['wombat', 'wombat'], ['capybara', 'capybara'], ['mole', 'mole'],
  ['kangaroo', 'kangaroo'], ['wallaby', 'wallaby'], ['koala', 'koala, koala bear'], ['sloth', 'sloth'], ['hippo', 'hippo, hippopotamus', null, true], ['gorilla', 'gorilla, silverback', null, true],
  ['chimpanzee', 'chimpanzee, chimp, ape', null, true], ['orangutan', 'orangutan'], ['lemur', 'lemur'], ['otter', 'otter, sea otter'], ['squirrel', 'squirrel, chipmunk'],
  ['hedgehog', 'hedgehog'], ['porcupine', 'porcupine'], ['bat', 'bat, bats, vampire bat'], ['hamster', 'hamster, guinea pig, gerbil'], ['rat', 'rat, rats'], ['beaver', 'beaver'],
  ['platypus', 'platypus'], ['moose', 'moose'], ['reindeer', 'reindeer, caribou'], ['elk', 'elk, stag'], ['llama', 'llama'], ['alpaca', 'alpaca'], ['donkey', 'donkey, mule, burro'],
  ['pony', 'pony'], ['bull', 'bull, ox', null, true], ['buffalo', 'buffalo, water buffalo'], ['bison', 'bison'], ['yak', 'yak'], ['boar', 'boar, wild boar'], ['warthog', 'warthog'],
  ['hyena', 'hyena'], ['coyote', 'coyote, jackal, dingo'], ['cheetah', 'cheetah'], ['jaguar', 'jaguar'], ['panther', 'panther, black panther'], ['lynx', 'lynx, bobcat'],
  ['cougar', 'cougar, puma, mountain lion'], ['snowleopard', 'snow leopard', null, true], ['polarbear', 'polar bear', null, true], ['grizzly', 'grizzly, grizzly bear, brown bear'],
  ['redpanda', 'red panda', null, true], ['anteater', 'anteater, aardvark'], ['armadillo', 'armadillo'], ['tapir', 'tapir'], ['okapi', 'okapi'],
  ['chameleon', 'chameleon'], ['iguana', 'iguana'], ['gecko', 'gecko'], ['lizard', 'lizard, newt'], ['komodo', 'komodo dragon, komodo, monitor lizard', null, true], ['axolotl', 'axolotl'],
  ['salamander', 'salamander, fire salamander'], ['raptor', 'velociraptor, raptor, raptors', null, true], ['spinosaurus', 'spinosaurus'], ['stegosaurus', 'stegosaurus', null, true],
  ['ankylosaurus', 'ankylosaurus'], ['pterodactyl', 'pterodactyl, pteranodon, pterosaur'], ['brachiosaurus', 'brachiosaurus, diplodocus'], ['parasaurolophus', 'parasaurolophus, duckbill dinosaur'],
  ['pegasus', 'pegasus, winged horse', null, true], ['cerberus', 'cerberus', null, true], ['hydra', 'hydra', null, true], ['chimera', 'chimera, chimaera', null, true], ['manticore', 'manticore'],
  ['hellhound', 'hellhound, hell hound, demon dog'], ['kirin', 'kirin, qilin'], ['wyvern', 'wyvern'], ['centaur', 'centaur, centaurs', null, true], ['griffon', 'griffon, gryphon'],
], 'species');

// Birds and fish handled by the fauna generators.
const BIRDS = rows('bird', 'animal', '🐦', [
  ['peacock', 'peacock, peafowl', null, true], ['swan', 'swan'], ['goose', 'goose, geese'], ['pelican', 'pelican'], ['stork', 'stork, heron, crane bird, egret'],
  ['hummingbird', 'hummingbird'], ['toucan', 'toucan'], ['seagull', 'seagull, gull'], ['pigeon', 'pigeon, dove'], ['hawk', 'hawk, falcon, kestrel'], ['vulture', 'vulture, condor'],
  ['ostrich', 'ostrich, emu'], ['turkey', 'turkey'], ['dodo', 'dodo, dodo bird', { species: 'turkey', color: '#8a8680' }], ['rooster', 'rooster, cockerel'], ['robin', 'robin, sparrow, finch, bluebird, songbird'], ['kiwi', 'kiwi bird'],
], 'species');
const FISH = rows('fish', 'animal', '🐟', [
  ['goldfish', 'goldfish'], ['clownfish', 'clownfish, nemo'], ['piranha', 'piranha'], ['swordfish', 'swordfish, marlin'], ['manta', 'manta ray, stingray, ray'],
  ['eel', 'eel, moray'], ['seahorse', 'seahorse, sea horse'], ['orca', 'orca, killer whale'], ['narwhal', 'narwhal'], ['pufferfish', 'pufferfish, blowfish'],
  ['squid', 'squid, giant squid', { species: 'octopus' }], ['starfish', 'starfish, sea star'], ['koi', 'koi, carp'], ['tuna', 'tuna, salmon, trout, bass'],
], 'species');

// Other buildings and places routed to existing generators.
const PLACES = [
  ...rows('building', 'building', '🏢', [
    ['office', 'office building, office tower, office block, office', { style: 'skyscraper', floors: 12 }],
    ['restaurant', 'restaurant, diner, cafe, café, coffee shop, pizzeria, pizza place, burger joint, burger restaurant, fast food restaurant, mcdonalds, bakery, ice cream shop, bookstore, toy store, pharmacy, barbershop, florist, boutique, candy shop, sweet shop, pub, tavern, ice cream parlor, bakery shop', { style: 'shop' }],
    ['cathedral', 'cathedral, basilica, chapel, abbey, monastery', { style: 'church' }, true],
    ['fort', 'fort, fortress, citadel, stronghold, keep', { style: 'castle' }],
    ['hauntedHouse', 'haunted house, haunted mansion, spooky house, haunted manor', { style: 'haunted' }, true],
    ['farmhouse', 'farmhouse, ranch house', { style: 'farmhouse' }],
    ['bungalow', 'bungalow, villa, beach house', { style: 'modern' }],
    ['spaceStation', 'space station, moon base, space base, research station, colony', { style: 'futuristic' }, true],
    ['stable', 'stable, stables, shed, cowshed, chicken coop, coop', { style: 'barn' }],
    ['shack', 'shack, hovel, lean-to', { style: 'hut' }],
    ['megatower', 'burj khalifa, empire state building, world trade center, one world trade center, petronas towers, shanghai tower, chrysler building, supertall, megatall, tallest building', { style: 'skyscraper', floors: 90 }, true],
    ['dungeon', 'dungeon, crypt, catacombs, tomb, mausoleum, machu picchu, angkor wat, ancient city, lost city', { style: 'ruins' }],
    ['obsTower', 'space needle, cn tower, tokyo tower, sky tower, tv tower, observation tower, space elevator', { style: 'tower' }],
  ]),
];

const VEHICLES = rows('vehicle', 'vehicle', '🚗', [
  ['fireTruck', 'fire truck, fire engine, firetruck', { kind: 'truck', color: '#c62828' }, true],
  ['iceCreamTruck', 'ice cream truck, ice cream van, food truck', { kind: 'van', color: '#f8c8d8' }, true],
  ['garbageTruck', 'garbage truck, dump truck, cement mixer, concrete mixer, monster truck, tow truck', { kind: 'truck' }, true],
  ['digger', 'excavator, bulldozer, digger, forklift, backhoe, steamroller, road roller', { kind: 'tractor', color: '#f2b81a' }, true],
  ['scooter', 'scooter, moped, vespa, segway, unicycle, tricycle, e-bike', { kind: 'bicycle' }, true],
  ['kart', 'go kart, go-kart, golf cart, buggy, dune buggy, quad bike, atv, snowmobile', { kind: 'sports' }, true],
  ['jeep', 'jeep, land rover, off-roader, 4x4', { kind: 'suv' }],
  ['cybertruck', 'cybertruck, tesla truck', { kind: 'pickup', color: '#b8bcc0' }],
  ['racecar', 'race car, racecar, racing car, formula one car, f1 car, lamborghini, ferrari, porsche, supercar, hypercar', { kind: 'sports' }, true],
  ['yacht', 'yacht, speedboat, motorboat, jet ski, jetski, canoe, kayak, rowboat, raft, gondola', { kind: 'boat' }, true],
  ['pirateShip', 'pirate ship, galleon, viking ship, longship, tall ship, clipper, frigate', { kind: 'sailboat', big: true }, true],
  ['warship', 'battleship, warship, aircraft carrier, cruise ship, ocean liner, titanic, ferry, cargo ship', { kind: 'boat', big: true }, true],
  ['jet', 'jet, fighter jet, jumbo jet, airliner, biplane, glider, seaplane', { kind: 'plane' }, true],
  ['chopper', 'chopper, gyrocopter', { kind: 'helicopter' }],
  ['starship', 'starship, space shuttle, x-wing, star destroyer, starfighter, spacecraft, mothership', { kind: 'spaceship' }, true],
  ['blimp', 'blimp, zeppelin, airship', { kind: 'balloon' }, true],
  ['tram', 'tram, streetcar, trolley, subway train, metro train, bullet train, steam locomotive, locomotive', { kind: 'train' }, true],
  ['carriage', 'carriage, horse carriage, stagecoach, cart, chariot, covered wagon', { kind: 'wagon' }, true],
]);
// Mythical people: animal-headed, winged, horned, tailed and fish-tailed
// humanoids built by the human generator's hybrid parts.
const HUMANOIDS = rows('human', 'character', '🧝', [
  ['minotaur', 'minotaur, minotaurs, bull man, bullman', { animalHead: 'bull', animalHeadScale: 1.35, height: 2.4, muscle: 0.95, fat: 0.3, sex: 'male', profession: 'minotaur' }],
  ['werewolf', 'werewolf, werewolves, wolfman, wolf man, lycan, lycanthrope', { animalHead: 'wolf', animalHeadScale: 1.2, height: 2.05, muscle: 0.8, fat: 0.25, profession: 'werewolf', tail: 'cat', tailColor: '#6a6660' }],
  ['anubis', 'anubis, jackal god, jackal headed god', { animalHead: 'jackal', height: 2.1, muscle: 0.6, fat: 0.12, sex: 'male', profession: 'anubis' }],
  ['horus', 'horus, falcon god, bird man, birdman', { animalHead: 'eagle', height: 2.0, muscle: 0.6, fat: 0.12, sex: 'male', profession: 'anubis', animalHeadColor: '#6a4a2a' }],
  ['lizardman', 'lizardman, lizard man, lizardmen, lizard folk, lizardfolk, reptilian, reptoid, argonian, kobold', { animalHead: 'lizard', height: 1.95, muscle: 0.7, fat: 0.15, profession: 'beastfolk', tail: 'lizard', tailColor: '#4a7a3a' }],
  ['catperson', 'cat person, catperson, cat man, catman, cat woman, catwoman, catgirl, cat girl, khajiit, tabaxi, cat folk', { animalHead: 'cat', height: 1.8, muscle: 0.5, fat: 0.15, profession: 'beastfolk', tail: 'cat', tailColor: '#8a7a6a' }],
  ['lionman', 'lion man, lionman, leonin, lion folk', { animalHead: 'lion', height: 2.1, muscle: 0.85, profession: 'beastfolk', tail: 'cat', tailColor: '#c8a060' }],
  ['pigman', 'pig man, pigman, orc pig, boar man', { animalHead: 'boar', height: 1.9, fat: 0.6, muscle: 0.6, profession: 'beastfolk' }],
  ['bunnyperson', 'bunny man, bunny person, rabbit man, rabbit person, bunny girl, easter bunny', { animalHead: 'rabbit', height: 1.8, profession: 'beastfolk' }],
  ['bearman', 'bear man, bearman, werebear, bear folk', { animalHead: 'bear', height: 2.3, fat: 0.55, muscle: 0.8, profession: 'beastfolk' }],
  ['goatman', 'goat man, goatman, faun, satyr, baphomet', { animalHead: 'goat', height: 1.9, muscle: 0.55, profession: 'beastfolk' }],
  ['horseman', 'horse man, horseman head, horse head man', { animalHead: 'horse', height: 2.0, profession: 'beastfolk' }],
  ['elephantman', 'elephant man, ganesha, elephant god', { animalHead: 'elephant', height: 1.9, fat: 0.55, profession: 'anubis' }],
  ['monkeyman', 'monkey man, ape man, hanuman, monkey king', { animalHead: 'monkey', height: 1.7, profession: 'beastfolk', tail: 'cat', tailColor: '#6a4a2a' }],
  ['sharkman', 'shark man, sharkman, shark person', { animalHead: 'shark', height: 2.0, muscle: 0.8, profession: 'beastfolk', skinColor: '#6a7a8a' }],
  ['dragonborn', 'dragonborn, dragon man, dragonman, dragon person, draconian', { animalHead: 'dragon', height: 2.1, muscle: 0.8, profession: 'beastfolk', tail: 'lizard', tailColor: '#8a1a1a', wings: 'bat', wingColor: '#5a1010' }],
  ['mermaid', 'mermaid, mermaids, siren, sea maiden, sea nymph', { mermaid: true, sex: 'female', profession: 'mermaid' }],
  ['merman', 'merman, mermen, triton, merfolk, sea king', { mermaid: true, sex: 'male', profession: 'mermaid', muscle: 0.7 }],
  ['angel', 'angel, angels, archangel, seraph, seraphim, cherub, guardian angel', { wings: 'feather', halo: true, profession: 'angel' }],
  ['cupid', 'cupid, eros, cherubim', { wings: 'feather', halo: false, height: 1.1, age: 8, profession: 'angel' }],
  ['demon', 'demon, demons, devil, the devil, satan, lucifer, imp, succubus, incubus, fiend, archdemon, daemon', { wings: 'bat', horns: true, tail: 'devil', skinColor: '#a02020', profession: 'demon', height: 2.1, muscle: 0.75 }],
  ['harpy', 'harpy, harpies', { wings: 'feather', wingColor: '#6a4a2a', sex: 'female', profession: 'harpy' }],
  ['gargoyle', 'gargoyle, gargoyles', { wings: 'bat', horns: true, tail: 'devil', statue: true, statueMaterial: 'stone', statueName: 'Gargoyle', profession: 'demon', height: 1.5 }],
  ['valkyrie', 'valkyrie, valkyries', { wings: 'feather', sex: 'female', profession: 'knight' }],
  ['fairy2', 'fairy, fairies, pixie, pixies, sprite, tinkerbell, tinker bell', { height: 0.5, sex: 'female', fairy: true, wings: 'fairy', profession: 'fairy' }],
  ['viking', 'viking, vikings, norseman, barbarian', { profession: 'viking', muscle: 0.8, facialHair: 'full', hair: { style: 'long' } }],
  ['gladiator', 'gladiator, gladiators, spartan, roman soldier, centurion, legionary', { profession: 'gladiator', muscle: 0.85, fat: 0.12 }],
  ['pharaoh', 'pharaoh, pharaohs, cleopatra, egyptian king, egyptian queen', { profession: 'anubis' }],
  ['samurai', 'samurai, shogun, ronin', { profession: 'samurai', muscle: 0.6 }],
  ['blacksmith', 'blacksmith, smith, forger, armorer', { profession: 'blacksmith', muscle: 0.8, sex: 'male' }],
  ['princess', 'princess, princesses', { profession: 'princess', sex: 'female', age: 19 }],
  ['prince', 'prince, princes', { profession: 'prince', sex: 'male', age: 22 }],
  ['dryad', 'dryad, nymph, wood nymph, forest spirit', { elf: true, sex: 'female', skinColor: '#8ab070', profession: 'elf', hair: { style: 'long', color: 'green' } }],
  ['horseman', 'horseman, headless horseman, horse rider, rider, jockey, equestrian, cavalryman', { profession: 'cowboy' }],
  ['slayer', 'dragon slayer, monster hunter, witcher, slayer, demon hunter', { profession: 'knight' }],
  ['earthElemental', 'earth elemental, rock golem, stone golem', { height: 2.8, muscle: 1, stone: true, profession: 'golem' }],
  ['santa', 'santa, santa claus, father christmas, saint nick, st nick', { profession: 'santa', sex: 'male', age: 70, fat: 0.7, facialHair: 'full', hair: { style: 'short', color: 'white' } }],
  ['leprechaun', 'leprechaun, leprechauns', { profession: 'leprechaun', sex: 'male', height: 1.0, facialHair: 'full', hair: { style: 'short', color: 'ginger' } }],
  ['genie', 'genie, djinn, jinn, genie of the lamp', { mermaid: true, tailColor: '#3a6ad8', skinColor: '#4a7ae0', profession: 'genie', muscle: 0.7, hair: { style: 'bald' } }],
  ['medusa', 'medusa, gorgon, naga, lamia, snake woman, snake lady', { mermaid: true, tailColor: '#4a7a3a', skinColor: '#9ab08a', sex: 'female', profession: 'mermaid', hair: { style: 'curly', color: 'green' } }],
  ['reaper', 'grim reaper, the grim reaper, reaper, death', { profession: 'reaper', skinColor: '#e8e4dc', height: 2.1, fat: 0.05, muscle: 0.1, hair: { style: 'bald' } }],
  ['pirateCaptain', 'pirate captain, captain hook, blackbeard', { profession: 'pirate', sex: 'male', facialHair: 'full' }],
  ['superhero', 'superhero, super hero, superman, batman, spiderman, spider-man, wonder woman, captain america, hero', { profession: 'superhero', muscle: 0.85, fat: 0.1 }],
  ['armor', 'suit of armor, suit of armour, armor stand, armour stand, knight statue', { statue: true, statueMaterial: 'steel', statueName: 'Suit of armor', profession: 'knight' }],
].map((r) => { r[3] = true; return r; }));
HUMANOIDS.push({ id: 'powerArmor', cat: 'robot', gen: 'robot', icon: '🤖', r: 0.8, p: { kind: 'humanoid', color: '#b82020', height: 2.1, displayName: 'Power armor' }, o: true, words: ['iron man', 'ironman', 'power armor', 'power armour', 'mech suit', 'battle suit', 'robot suit'] });

const ROOMS = rows('scene', 'scene', '🏠', [
  ['kitchen', 'kitchen, kitchens', { kind: 'kitchen' }], ['bathroom', 'bathroom, bath room, restroom, washroom', { kind: 'bathroom' }],
  ['bedroom', 'bedroom, bed room, kids room, nursery', { kind: 'bedroom' }], ['classroom', 'classroom, class room, school room', { kind: 'classroom' }],
  ['officeRoom', 'office room, home office, study room, workspace, desk setup', { kind: 'officeRoom' }],
]);

const MYTH = [
  { id: 'basilisk', cat: 'animal', gen: 'snake', icon: '🐍', r: 1, p: { species: 'snake', giant: true }, o: true, words: ['basilisk', 'giant serpent', 'sea serpent', 'leviathan', 'loch ness monster', 'nessie', 'jormungandr'] },
  { id: 'dam', cat: 'structure', gen: 'landmark', icon: '🧱', r: 20, p: { kind: 'greatWall', displayName: 'Dam' }, o: true, words: ['dam', 'hoover dam', 'barrage'] },
  { id: 'banshee', cat: 'creature', gen: 'blob', icon: '👻', r: 1, p: { kind: 'ghost', displayName: 'Banshee' }, o: true, words: ['banshee', 'wraith', 'spirit', 'phantom', 'specter', 'spectre', 'poltergeist', 'air elemental', 'wind spirit', 'shadow creature', 'shade'] },
  { id: 'waterElemental', cat: 'creature', gen: 'blob', icon: '💧', r: 1, p: { kind: 'slime', color: '#3a8ad8', displayName: 'Water elemental' }, o: true, words: ['water elemental', 'water spirit'] },
  { id: 'fireElemental', cat: 'creature', gen: 'blob', icon: '🔥', r: 1, p: { kind: 'slime', color: '#ff6a1a', glow: true, displayName: 'Fire elemental' }, o: true, words: ['fire elemental', 'fire spirit', 'flame spirit'] },
  { id: 'snail', cat: 'creature', gen: 'blob', icon: '🐌', r: 0.4, p: { kind: 'slime', color: '#a8906a', displayName: 'Snail' }, o: true, words: ['snail', 'slug', 'snails'] },
  { id: 'caterpillar', cat: 'animal', gen: 'snake', icon: '🐛', r: 0.4, p: { species: 'snake', color: '#6ab02a', small: true, displayName: 'Caterpillar' }, o: true, words: ['caterpillar', 'larva', 'grub', 'inchworm'] },
  { id: 'treant', cat: 'nature', gen: 'nature', icon: '🌳', r: 3, p: { kind: 'tree', species: 'oak', displayName: 'Treant' }, o: true, words: ['treant', 'ent', 'tree ent', 'tree man', 'talking tree', 'living tree'] },
  { id: 'skeletonWarrior', cat: 'object', gen: 'gadget', icon: '💀', r: 1, p: { kind: 'skeleton', displayName: 'Skeleton warrior' }, o: true, words: ['skeleton warrior', 'skeleton knight', 'undead warrior'] },
];

// These categories take their display name from the user's own phrase.
for (const c of [...GADGETS, ...FOODS, ...MISCS, ...CIVIC, ...SPECIES, ...BIRDS, ...FISH, ...VEHICLES, ...RIDES]) c.p = { ...c.p, usePhrase: true };
for (const c of PLACES) if (c.id !== 'restaurant') c.p = { ...c.p, usePhrase: true };
// Humanoids show their kind as a subtitle under their personal name.
for (const c of HUMANOIDS) if (c.gen === 'human') c.p = { ...c.p, displayName: c.words[0].replace(/\b\w/, (m) => m.toUpperCase()) };

// Every entry here is more specific than the older lexicon's coarse
// mapping for the same word (a violin used to be a guitar, a squirrel a
// mouse, a washing machine a fridge), so the whole table takes precedence.
export const CONCEPTS2 = [...ROOMS, ...HUMANOIDS, ...GADGETS, ...FOODS, ...MISCS, ...ARCHETYPES, ...RIDES, ...CIVIC, ...LANDMARKS, ...SPECIES, ...BIRDS, ...FISH, ...PLACES, ...VEHICLES, ...MYTH];
for (const c of CONCEPTS2) c.o = true;
