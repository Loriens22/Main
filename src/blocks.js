/* =====================================================================
   BLOCK PALETTE  —  Minecraft Spawn Hub
   ---------------------------------------------------------------------
   Every block the world can contain is declared here exactly once.
   Builders reference blocks by name through the global `B` object,
   e.g.  B.STONE_BRICKS, B.OAK_PLANKS, B.LANTERN

   Definition tuple:  [ NAME, TEXTURE, OPTS ]

   TEXTURE:  'name'                         -> same texture on all 6 faces
             {t:'top', b:'bottom', s:'side'}-> per-face
             {t, b, s, n, e, w}             -> fully explicit (n/e/w/s override)

   OPTS:
     shape  : 'full'(default) 'slab' 'slabTop' 'stairs' 'carpet' 'pane'
              'fence' 'wall' 'post' 'torch' 'lantern' 'hangLantern' 'cross'
              'flat' 'door' 'trapdoor' 'trapdoorUp' 'chest' 'bed' 'bars'
              'ladder' 'rail' 'sign' 'wallSign' 'frame' 'pot' 'campfire'
              'cauldron' 'anvil' 'brewing' 'hopper' 'button' 'plate'
              'end_rod' 'chain' 'candle' 'scaffold' 'lectern' 'stem'
              'bigcross' 'layer' 'head' 'skinny' 'table' 'stool' 'lily'
     light  : 0..15 emitted light level
     opaque : false for glass/plants/water (default true unless shape != full)
     alpha  : true -> texture has cut-out / translucency
     axis   : true -> block can be rotated on an axis (logs / pillars)
     wave   : true -> gentle vertex wobble (foliage / water surface)
     anim   : 'lava' | 'water' -> animated shader treatment
     solidT : force treating as solid for face culling
   ===================================================================== */

(function (root) {
  'use strict';

  const D = [
    /* ---- 0 : nothing ---------------------------------------------- */
    ['AIR', null, { air: true, opaque: false }],

    /* ---- terrain & stone ------------------------------------------ */
    ['STONE', 'stone', {}],
    ['COBBLESTONE', 'cobble', {}],
    ['MOSSY_COBBLESTONE', 'mossy_cobble', {}],
    ['DIRT', 'dirt', {}],
    ['COARSE_DIRT', 'coarse_dirt', {}],
    ['ROOTED_DIRT', 'rooted_dirt', {}],
    ['PODZOL', { t: 'podzol_top', b: 'dirt', s: 'podzol_side' }, {}],
    ['GRASS_BLOCK', { t: 'grass_top', b: 'dirt', s: 'grass_side' }, {}],
    ['DIRT_PATH', { t: 'path_top', b: 'dirt', s: 'path_side' }, {}],
    ['FARMLAND', { t: 'farmland', b: 'dirt', s: 'dirt' }, {}],
    ['FARMLAND_WET', { t: 'farmland_wet', b: 'dirt', s: 'dirt' }, {}],
    ['SAND', 'sand', {}],
    ['GRAVEL', 'gravel', {}],
    ['CLAY', 'clay', {}],
    ['ANDESITE', 'andesite', {}],
    ['POLISHED_ANDESITE', 'polished_andesite', {}],
    ['DIORITE', 'diorite', {}],
    ['POLISHED_DIORITE', 'polished_diorite', {}],
    ['GRANITE', 'granite', {}],
    ['POLISHED_GRANITE', 'polished_granite', {}],
    ['TUFF', 'tuff', {}],
    ['CALCITE', 'calcite', {}],
    ['DEEPSLATE', 'deepslate', { axis: true }],
    ['COBBLED_DEEPSLATE', 'cobbled_deepslate', {}],
    ['DEEPSLATE_BRICKS', 'deepslate_bricks', {}],
    ['DEEPSLATE_TILES', 'deepslate_tiles', {}],
    ['POLISHED_DEEPSLATE', 'polished_deepslate', {}],
    ['SMOOTH_STONE', 'smooth_stone', {}],
    ['STONE_BRICKS', 'stone_bricks', {}],
    ['MOSSY_STONE_BRICKS', 'mossy_stone_bricks', {}],
    ['CRACKED_STONE_BRICKS', 'cracked_stone_bricks', {}],
    ['CHISELED_STONE_BRICKS', 'chiseled_stone_bricks', {}],
    ['BRICKS', 'bricks', {}],
    ['MUD_BRICKS', 'mud_bricks', {}],
    ['SANDSTONE', { t: 'sandstone_top', b: 'sandstone_top', s: 'sandstone' }, {}],
    ['COAL_ORE', 'coal_ore', {}],
    ['IRON_ORE', 'iron_ore', {}],
    ['GOLD_ORE', 'gold_ore', {}],
    ['DIAMOND_ORE', 'diamond_ore', {}],
    ['REDSTONE_ORE', 'redstone_ore', { light: 4 }],
    ['EMERALD_ORE', 'emerald_ore', {}],
    ['BEDROCK', 'bedrock', {}],
    ['MOSS_BLOCK', 'moss', {}],

    /* ---- wood ------------------------------------------------------ */
    ['OAK_PLANKS', 'oak_planks', {}],
    ['SPRUCE_PLANKS', 'spruce_planks', {}],
    ['BIRCH_PLANKS', 'birch_planks', {}],
    ['DARK_OAK_PLANKS', 'dark_oak_planks', {}],
    ['JUNGLE_PLANKS', 'jungle_planks', {}],
    ['ACACIA_PLANKS', 'acacia_planks', {}],
    ['OAK_LOG', { t: 'oak_log_top', b: 'oak_log_top', s: 'oak_log' }, { axis: true }],
    ['SPRUCE_LOG', { t: 'spruce_log_top', b: 'spruce_log_top', s: 'spruce_log' }, { axis: true }],
    ['BIRCH_LOG', { t: 'birch_log_top', b: 'birch_log_top', s: 'birch_log' }, { axis: true }],
    ['DARK_OAK_LOG', { t: 'dark_oak_log_top', b: 'dark_oak_log_top', s: 'dark_oak_log' }, { axis: true }],
    ['STRIPPED_OAK_LOG', { t: 'oak_log_top', b: 'oak_log_top', s: 'stripped_oak_log' }, { axis: true }],
    ['STRIPPED_SPRUCE_LOG', { t: 'spruce_log_top', b: 'spruce_log_top', s: 'stripped_spruce_log' }, { axis: true }],
    ['OAK_LEAVES', 'oak_leaves', { opaque: false, alpha: true, wave: true }],
    ['BIRCH_LEAVES', 'birch_leaves', { opaque: false, alpha: true, wave: true }],
    ['SPRUCE_LEAVES', 'spruce_leaves', { opaque: false, alpha: true, wave: true }],
    ['DARK_OAK_LEAVES', 'dark_oak_leaves', { opaque: false, alpha: true, wave: true }],
    ['AZALEA_LEAVES', 'azalea_leaves', { opaque: false, alpha: true, wave: true }],
    ['FLOWERING_AZALEA', 'flowering_azalea', { opaque: false, alpha: true, wave: true }],
    ['BOOKSHELF', { t: 'oak_planks', b: 'oak_planks', s: 'bookshelf' }, {}],
    ['CHISELED_BOOKSHELF', { t: 'oak_planks', b: 'oak_planks', s: 'chiseled_bookshelf' }, {}],
    ['CRAFTING_TABLE', { t: 'crafting_top', b: 'oak_planks', s: 'crafting_side' }, {}],
    ['BARREL', { t: 'barrel_top', b: 'barrel_top', s: 'barrel_side' }, {}],
    ['JUKEBOX', { t: 'jukebox_top', b: 'noteblock', s: 'noteblock' }, {}],
    ['NOTE_BLOCK', 'noteblock', {}],
    ['LOOM', { t: 'loom_top', b: 'oak_planks', s: 'loom_side' }, {}],
    ['SMITHING_TABLE', { t: 'smithing_top', b: 'dark_oak_planks', s: 'smithing_side' }, {}],
    ['CARTOGRAPHY_TABLE', { t: 'cartography_top', b: 'dark_oak_planks', s: 'cartography_side' }, {}],
    ['COMPOSTER', { t: 'composter_top', b: 'oak_planks', s: 'composter_side' }, {}],
    ['HAY_BALE', { t: 'hay_top', b: 'hay_top', s: 'hay_side' }, { axis: true }],

    /* ---- quartz / modern ------------------------------------------- */
    ['QUARTZ_BLOCK', 'quartz', {}],
    ['SMOOTH_QUARTZ', 'smooth_quartz', {}],
    ['QUARTZ_PILLAR', { t: 'quartz_pillar_top', b: 'quartz_pillar_top', s: 'quartz_pillar' }, { axis: true }],
    ['CHISELED_QUARTZ', 'chiseled_quartz', {}],
    ['QUARTZ_BRICKS', 'quartz_bricks', {}],
    ['IRON_BLOCK', 'iron_block', {}],
    ['GOLD_BLOCK', 'gold_block', {}],
    ['DIAMOND_BLOCK', 'diamond_block', {}],
    ['EMERALD_BLOCK', 'emerald_block', {}],
    ['COPPER_BLOCK', 'copper_block', {}],
    ['OXIDIZED_COPPER', 'oxidized_copper', {}],
    ['PRISMARINE', 'prismarine', {}],
    ['PRISMARINE_BRICKS', 'prismarine_bricks', {}],
    ['DARK_PRISMARINE', 'dark_prismarine', {}],
    ['SEA_LANTERN', 'sea_lantern', { light: 15 }],
    ['GLOWSTONE', 'glowstone', { light: 15 }],
    ['SHROOMLIGHT', 'shroomlight', { light: 15 }],
    ['OCHRE_FROGLIGHT', 'ochre_froglight', { light: 15, axis: true }],
    ['REDSTONE_LAMP', 'redstone_lamp', { light: 14 }],
    ['OBSERVER', { t: 'observer_top', b: 'observer_top', s: 'observer_side' }, {}],
    ['PISTON', { t: 'piston_top', b: 'piston_bottom', s: 'piston_side' }, {}],
    ['DISPENSER', { t: 'furnace_top', b: 'furnace_top', s: 'dispenser_front' }, {}],
    ['TARGET', 'target', {}],
    ['TNT', { t: 'tnt_top', b: 'tnt_top', s: 'tnt_side' }, {}],

    /* ---- concrete --------------------------------------------------- */
    ['WHITE_CONCRETE', 'c_white', {}],
    ['LIGHT_GRAY_CONCRETE', 'c_lightgray', {}],
    ['GRAY_CONCRETE', 'c_gray', {}],
    ['BLACK_CONCRETE', 'c_black', {}],
    ['CYAN_CONCRETE', 'c_cyan', {}],
    ['LIGHT_BLUE_CONCRETE', 'c_lightblue', {}],
    ['BLUE_CONCRETE', 'c_blue', {}],
    ['GREEN_CONCRETE', 'c_green', {}],
    ['LIME_CONCRETE', 'c_lime', {}],
    ['YELLOW_CONCRETE', 'c_yellow', {}],
    ['ORANGE_CONCRETE', 'c_orange', {}],
    ['RED_CONCRETE', 'c_red', {}],
    ['PINK_CONCRETE', 'c_pink', {}],
    ['PURPLE_CONCRETE', 'c_purple', {}],
    ['MAGENTA_CONCRETE', 'c_magenta', {}],
    ['BROWN_CONCRETE', 'c_brown', {}],

    /* ---- terracotta -------------------------------------------------- */
    ['TERRACOTTA', 't_plain', {}],
    ['WHITE_TERRACOTTA', 't_white', {}],
    ['LIGHT_GRAY_TERRACOTTA', 't_lightgray', {}],
    ['GRAY_TERRACOTTA', 't_gray', {}],
    ['BLACK_TERRACOTTA', 't_black', {}],
    ['CYAN_TERRACOTTA', 't_cyan', {}],
    ['LIGHT_BLUE_TERRACOTTA', 't_lightblue', {}],
    ['BLUE_TERRACOTTA', 't_blue', {}],
    ['GREEN_TERRACOTTA', 't_green', {}],
    ['LIME_TERRACOTTA', 't_lime', {}],
    ['YELLOW_TERRACOTTA', 't_yellow', {}],
    ['ORANGE_TERRACOTTA', 't_orange', {}],
    ['RED_TERRACOTTA', 't_red', {}],
    ['PURPLE_TERRACOTTA', 't_purple', {}],
    ['BROWN_TERRACOTTA', 't_brown', {}],
    ['PINK_TERRACOTTA', 't_pink', {}],

    /* ---- wool -------------------------------------------------------- */
    ['WHITE_WOOL', 'w_white', {}],
    ['LIGHT_GRAY_WOOL', 'w_lightgray', {}],
    ['GRAY_WOOL', 'w_gray', {}],
    ['BLACK_WOOL', 'w_black', {}],
    ['RED_WOOL', 'w_red', {}],
    ['ORANGE_WOOL', 'w_orange', {}],
    ['YELLOW_WOOL', 'w_yellow', {}],
    ['LIME_WOOL', 'w_lime', {}],
    ['GREEN_WOOL', 'w_green', {}],
    ['CYAN_WOOL', 'w_cyan', {}],
    ['LIGHT_BLUE_WOOL', 'w_lightblue', {}],
    ['BLUE_WOOL', 'w_blue', {}],
    ['PURPLE_WOOL', 'w_purple', {}],
    ['MAGENTA_WOOL', 'w_magenta', {}],
    ['PINK_WOOL', 'w_pink', {}],
    ['BROWN_WOOL', 'w_brown', {}],

    /* ---- glass -------------------------------------------------------- */
    ['GLASS', 'glass', { opaque: false, alpha: true }],
    ['TINTED_GLASS', 'glass_tinted', { opaque: false, alpha: true }],
    ['WHITE_STAINED_GLASS', 'g_white', { opaque: false, alpha: true }],
    ['GRAY_STAINED_GLASS', 'g_gray', { opaque: false, alpha: true }],
    ['BLACK_STAINED_GLASS', 'g_black', { opaque: false, alpha: true }],
    ['LIGHT_BLUE_STAINED_GLASS', 'g_lightblue', { opaque: false, alpha: true }],
    ['BLUE_STAINED_GLASS', 'g_blue', { opaque: false, alpha: true }],
    ['CYAN_STAINED_GLASS', 'g_cyan', { opaque: false, alpha: true }],
    ['GREEN_STAINED_GLASS', 'g_green', { opaque: false, alpha: true }],
    ['LIME_STAINED_GLASS', 'g_lime', { opaque: false, alpha: true }],
    ['YELLOW_STAINED_GLASS', 'g_yellow', { opaque: false, alpha: true }],
    ['ORANGE_STAINED_GLASS', 'g_orange', { opaque: false, alpha: true }],
    ['RED_STAINED_GLASS', 'g_red', { opaque: false, alpha: true }],
    ['PURPLE_STAINED_GLASS', 'g_purple', { opaque: false, alpha: true }],
    ['MAGENTA_STAINED_GLASS', 'g_magenta', { opaque: false, alpha: true }],
    ['PINK_STAINED_GLASS', 'g_pink', { opaque: false, alpha: true }],

    /* ---- glass panes (thin) -------------------------------------------- */
    ['GLASS_PANE', 'glass', { shape: 'pane', opaque: false, alpha: true }],
    ['WHITE_PANE', 'g_white', { shape: 'pane', opaque: false, alpha: true }],
    ['BLUE_PANE', 'g_blue', { shape: 'pane', opaque: false, alpha: true }],
    ['LIGHT_BLUE_PANE', 'g_lightblue', { shape: 'pane', opaque: false, alpha: true }],
    ['CYAN_PANE', 'g_cyan', { shape: 'pane', opaque: false, alpha: true }],
    ['PURPLE_PANE', 'g_purple', { shape: 'pane', opaque: false, alpha: true }],
    ['GREEN_PANE', 'g_green', { shape: 'pane', opaque: false, alpha: true }],
    ['RED_PANE', 'g_red', { shape: 'pane', opaque: false, alpha: true }],
    ['YELLOW_PANE', 'g_yellow', { shape: 'pane', opaque: false, alpha: true }],
    ['BLACK_PANE', 'g_black', { shape: 'pane', opaque: false, alpha: true }],
    ['IRON_BARS', 'iron_bars', { shape: 'pane', opaque: false, alpha: true }],

    /* ---- nether / lava -------------------------------------------------- */
    ['NETHERRACK', 'netherrack', {}],
    ['NETHER_BRICKS', 'nether_bricks', {}],
    ['RED_NETHER_BRICKS', 'red_nether_bricks', {}],
    ['OBSIDIAN', 'obsidian', {}],
    ['CRYING_OBSIDIAN', 'crying_obsidian', { light: 10 }],
    ['MAGMA_BLOCK', 'magma', { light: 3, anim: 'lava' }],
    ['LAVA', 'lava', { light: 15, anim: 'lava' }],
    ['SOUL_SAND', 'soul_sand', {}],
    ['SOUL_SOIL', 'soul_soil', {}],
    ['BLACKSTONE', 'blackstone', {}],
    ['END_PORTAL_FRAME', { t: 'end_frame_top', b: 'end_frame_bottom', s: 'end_frame_side' }, { light: 1 }],
    ['PURPUR_BLOCK', 'purpur', {}],

    /* ---- water ------------------------------------------------------------ */
    ['WATER', 'water', { opaque: false, alpha: true, anim: 'water', wave: true, liquid: true }],
    ['ICE', 'ice', { opaque: false, alpha: true }],
    ['SNOW_BLOCK', 'snow', {}],
    ['PACKED_ICE', 'packed_ice', {}],

    /* ---- bee / honey -------------------------------------------------------- */
    ['HONEYCOMB_BLOCK', 'honeycomb', {}],
    ['HONEY_BLOCK', 'honey', { opaque: false, alpha: true }],
    ['BEE_NEST', { t: 'bee_nest_top', b: 'bee_nest_top', s: 'bee_nest_side' }, {}],
    ['BEEHIVE', { t: 'beehive_top', b: 'beehive_top', s: 'beehive_side' }, {}],

    /* ---- utility blocks ------------------------------------------------------ */
    ['FURNACE', { t: 'furnace_top', b: 'furnace_top', s: 'furnace_side', n: 'furnace_front' }, { light: 8, facing: true }],
    ['BLAST_FURNACE', { t: 'furnace_top', b: 'furnace_top', s: 'blast_side', n: 'blast_front' }, { light: 8, facing: true }],
    ['SMOKER', { t: 'smoker_top', b: 'furnace_top', s: 'smoker_side', n: 'smoker_front' }, { light: 8, facing: true }],
    ['ENCHANTING_TABLE', { t: 'ench_top', b: 'obsidian', s: 'ench_side' }, { shape: 'table', light: 7, opaque: false }],
    ['ENDER_CHEST', 'ender_chest', { shape: 'chest', light: 7, opaque: false }],
    ['CHEST', 'chest', { shape: 'chest', opaque: false }],
    ['CHEST_OPEN', 'chest', { shape: 'chestOpen', opaque: false }],
    ['TRAPPED_CHEST', 'chest_trapped', { shape: 'chest', opaque: false }],
    ['ANVIL', 'anvil', { shape: 'anvil', opaque: false }],
    ['CAULDRON', 'cauldron', { shape: 'cauldron', opaque: false }],
    ['BREWING_STAND', 'brewing', { shape: 'brewing', opaque: false, light: 1 }],
    ['HOPPER', 'hopper', { shape: 'hopper', opaque: false }],
    ['LECTERN', 'lectern', { shape: 'lectern', opaque: false }],
    ['FLOWER_POT', 'flowerpot', { shape: 'pot', opaque: false }],
    ['CAKE', 'cake', { shape: 'cake', opaque: false }],
    ['SCAFFOLDING', 'scaffold', { shape: 'scaffold', opaque: false, alpha: true }],
    ['LADDER', 'ladder', { shape: 'ladder', opaque: false, alpha: true, facing: true }],
    ['RAIL', 'rail', { shape: 'rail', opaque: false, alpha: true }],
    ['POWERED_RAIL', 'powered_rail', { shape: 'rail', opaque: false, alpha: true, light: 2 }],
    ['ARMOR_STAND', 'armor_stand', { shape: 'armorstand', opaque: false, alpha: true }],
    ['ITEM_FRAME', 'item_frame', { shape: 'frame', opaque: false, alpha: true, facing: true }],
    ['PAINTING_A', 'painting_a', { shape: 'frame', opaque: false, alpha: true, facing: true }],
    ['PAINTING_B', 'painting_b', { shape: 'frame', opaque: false, alpha: true, facing: true }],
    ['PAINTING_C', 'painting_c', { shape: 'frame', opaque: false, alpha: true, facing: true }],
    ['MAP_FRAME', 'map_frame', { shape: 'frame', opaque: false, alpha: true, facing: true }],
    ['SIGN', 'sign', { shape: 'sign', opaque: false, alpha: true, facing: true }],
    ['WALL_SIGN', 'sign', { shape: 'wallSign', opaque: false, alpha: true, facing: true }],
    ['SHOP_SIGN', 'sign_shop', { shape: 'wallSign', opaque: false, alpha: true, facing: true }],
    ['FOOD_SIGN', 'sign_food', { shape: 'wallSign', opaque: false, alpha: true, facing: true }],
    ['GEAR_SIGN', 'sign_gear', { shape: 'wallSign', opaque: false, alpha: true, facing: true }],
    ['TRADES_SIGN', 'sign_trades', { shape: 'wallSign', opaque: false, alpha: true, facing: true }],
    ['SPAWN_SIGN', 'sign_spawn', { shape: 'wallSign', opaque: false, alpha: true, facing: true }],

    /* ---- lights ---------------------------------------------------------------- */
    ['TORCH', 'torch', { shape: 'torch', light: 14, opaque: false, alpha: true }],
    ['WALL_TORCH', 'torch', { shape: 'wallTorch', light: 14, opaque: false, alpha: true, facing: true }],
    ['SOUL_TORCH', 'soul_torch', { shape: 'torch', light: 10, opaque: false, alpha: true }],
    ['SOUL_WALL_TORCH', 'soul_torch', { shape: 'wallTorch', light: 10, opaque: false, alpha: true, facing: true }],
    ['LANTERN', 'lantern', { shape: 'lantern', light: 15, opaque: false, alpha: true }],
    ['HANGING_LANTERN', 'lantern', { shape: 'hangLantern', light: 15, opaque: false, alpha: true }],
    ['SOUL_LANTERN', 'soul_lantern', { shape: 'lantern', light: 10, opaque: false, alpha: true }],
    ['HANGING_SOUL_LANTERN', 'soul_lantern', { shape: 'hangLantern', light: 10, opaque: false, alpha: true }],
    ['CAMPFIRE', { t: 'campfire_top', b: 'oak_log_top', s: 'campfire_side' }, { shape: 'campfire', light: 15, opaque: false, alpha: true }],
    ['SOUL_CAMPFIRE', { t: 'soul_campfire_top', b: 'oak_log_top', s: 'campfire_side' }, { shape: 'campfire', light: 10, opaque: false, alpha: true }],
    ['JACK_O_LANTERN', { t: 'pumpkin_top', b: 'pumpkin_top', s: 'pumpkin_side', n: 'jack_front' }, { light: 15, facing: true }],
    ['CARVED_PUMPKIN', { t: 'pumpkin_top', b: 'pumpkin_top', s: 'pumpkin_side', n: 'pumpkin_face' }, { facing: true }],
    ['PUMPKIN', { t: 'pumpkin_top', b: 'pumpkin_top', s: 'pumpkin_side' }, {}],
    ['END_ROD', 'end_rod', { shape: 'end_rod', light: 14, opaque: false, alpha: true }],
    ['CHAIN', 'chain', { shape: 'chain', opaque: false, alpha: true }],
    ['CANDLE', 'candle', { shape: 'candle', light: 6, opaque: false, alpha: true }],

    /* ---- beds ---------------------------------------------------------------- */
    ['RED_BED', { t: 'bed_red_top', s: 'bed_red_side', b: 'oak_planks' }, { shape: 'bed', opaque: false, facing: true }],
    ['WHITE_BED', { t: 'bed_white_top', s: 'bed_white_side', b: 'oak_planks' }, { shape: 'bed', opaque: false, facing: true }],
    ['BLUE_BED', { t: 'bed_blue_top', s: 'bed_blue_side', b: 'oak_planks' }, { shape: 'bed', opaque: false, facing: true }],
    ['GREEN_BED', { t: 'bed_green_top', s: 'bed_green_side', b: 'oak_planks' }, { shape: 'bed', opaque: false, facing: true }],
    ['YELLOW_BED', { t: 'bed_yellow_top', s: 'bed_yellow_side', b: 'oak_planks' }, { shape: 'bed', opaque: false, facing: true }],
    ['PURPLE_BED', { t: 'bed_purple_top', s: 'bed_purple_side', b: 'oak_planks' }, { shape: 'bed', opaque: false, facing: true }],

    /* ---- carpets (thin, colored) ------------------------------------------------ */
    ['WHITE_CARPET', 'w_white', { shape: 'carpet', opaque: false }],
    ['GRAY_CARPET', 'w_gray', { shape: 'carpet', opaque: false }],
    ['BLACK_CARPET', 'w_black', { shape: 'carpet', opaque: false }],
    ['RED_CARPET', 'w_red', { shape: 'carpet', opaque: false }],
    ['BLUE_CARPET', 'w_blue', { shape: 'carpet', opaque: false }],
    ['CYAN_CARPET', 'w_cyan', { shape: 'carpet', opaque: false }],
    ['GREEN_CARPET', 'w_green', { shape: 'carpet', opaque: false }],
    ['LIME_CARPET', 'w_lime', { shape: 'carpet', opaque: false }],
    ['YELLOW_CARPET', 'w_yellow', { shape: 'carpet', opaque: false }],
    ['ORANGE_CARPET', 'w_orange', { shape: 'carpet', opaque: false }],
    ['PURPLE_CARPET', 'w_purple', { shape: 'carpet', opaque: false }],
    ['MAGENTA_CARPET', 'w_magenta', { shape: 'carpet', opaque: false }],
    ['PINK_CARPET', 'w_pink', { shape: 'carpet', opaque: false }],
    ['BROWN_CARPET', 'w_brown', { shape: 'carpet', opaque: false }],
    ['LIGHT_BLUE_CARPET', 'w_lightblue', { shape: 'carpet', opaque: false }],
    ['MOSS_CARPET', 'moss', { shape: 'carpet', opaque: false }],
    ['SNOW_LAYER', 'snow', { shape: 'carpet', opaque: false }],

    /* ---- banners (wall hangings) -------------------------------------------------- */
    ['RED_BANNER', 'banner_red', { shape: 'banner', opaque: false, alpha: true, facing: true }],
    ['BLUE_BANNER', 'banner_blue', { shape: 'banner', opaque: false, alpha: true, facing: true }],
    ['YELLOW_BANNER', 'banner_yellow', { shape: 'banner', opaque: false, alpha: true, facing: true }],
    ['PURPLE_BANNER', 'banner_purple', { shape: 'banner', opaque: false, alpha: true, facing: true }],
    ['WHITE_BANNER', 'banner_white', { shape: 'banner', opaque: false, alpha: true, facing: true }],
    ['GREEN_BANNER', 'banner_green', { shape: 'banner', opaque: false, alpha: true, facing: true }],

    /* ---- plants (cross billboards) ---------------------------------------------- */
    ['TALL_GRASS', 'tall_grass', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['FERN', 'fern', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['LARGE_FERN', 'large_fern', { shape: 'bigcross', opaque: false, alpha: true, wave: true }],
    ['DEAD_BUSH', 'dead_bush', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['POPPY', 'poppy', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['DANDELION', 'dandelion', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['BLUE_ORCHID', 'blue_orchid', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['ALLIUM', 'allium', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['CORNFLOWER', 'cornflower', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['OXEYE_DAISY', 'oxeye_daisy', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['LILY_OF_THE_VALLEY', 'lily_valley', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['RED_TULIP', 'tulip_red', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['PINK_TULIP', 'tulip_pink', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['ORANGE_TULIP', 'tulip_orange', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['WHITE_TULIP', 'tulip_white', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['SUNFLOWER', 'sunflower', { shape: 'bigcross', opaque: false, alpha: true, wave: true }],
    ['ROSE_BUSH', 'rose_bush', { shape: 'bigcross', opaque: false, alpha: true, wave: true }],
    ['LILAC', 'lilac', { shape: 'bigcross', opaque: false, alpha: true, wave: true }],
    ['WITHER_ROSE', 'wither_rose', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['RED_MUSHROOM', 'mushroom_red', { shape: 'cross', opaque: false, alpha: true }],
    ['BROWN_MUSHROOM', 'mushroom_brown', { shape: 'cross', opaque: false, alpha: true }],
    ['SWEET_BERRY_BUSH', 'berry_bush', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['WHEAT', 'wheat', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['WHEAT_YOUNG', 'wheat_young', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['CARROTS', 'carrots', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['POTATOES', 'potatoes', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['BEETROOTS', 'beetroots', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['SUGAR_CANE', 'sugar_cane', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['BAMBOO', 'bamboo', { shape: 'stem', opaque: false, alpha: true, wave: true }],
    ['CACTUS', { t: 'cactus_top', b: 'cactus_top', s: 'cactus_side' }, { shape: 'cactus', opaque: false }],
    ['VINE', 'vine', { shape: 'vine', opaque: false, alpha: true, wave: true, facing: true }],
    ['LILY_PAD', 'lily_pad', { shape: 'lily', opaque: false, alpha: true }],
    ['SEAGRASS', 'seagrass', { shape: 'cross', opaque: false, alpha: true, wave: true }],
    ['GLOW_LICHEN', 'glow_lichen', { shape: 'vine', opaque: false, alpha: true, light: 7, facing: true }],
    ['SPORE_BLOSSOM', 'spore_blossom', { shape: 'lilyUp', opaque: false, alpha: true }],
    ['MELON', 'melon', { t: 'melon_top', b: 'melon_top', s: 'melon_side' }],
    ['PUMPKIN_STEM', 'stem_plant', { shape: 'cross', opaque: false, alpha: true }],

    /* ---- stairs (one entry per material; direction lives in block state) -------- */
    ['STONE_BRICK_STAIRS', 'stone_bricks', { shape: 'stairs', opaque: false, facing: true }],
    ['COBBLE_STAIRS', 'cobble', { shape: 'stairs', opaque: false, facing: true }],
    ['MOSSY_COBBLE_STAIRS', 'mossy_cobble', { shape: 'stairs', opaque: false, facing: true }],
    ['DEEPSLATE_BRICK_STAIRS', 'deepslate_bricks', { shape: 'stairs', opaque: false, facing: true }],
    ['COBBLED_DEEPSLATE_STAIRS', 'cobbled_deepslate', { shape: 'stairs', opaque: false, facing: true }],
    ['ANDESITE_STAIRS', 'andesite', { shape: 'stairs', opaque: false, facing: true }],
    ['STONE_STAIRS', 'stone', { shape: 'stairs', opaque: false, facing: true }],
    ['SMOOTH_STONE_STAIRS', 'smooth_stone', { shape: 'stairs', opaque: false, facing: true }],
    ['OAK_STAIRS', 'oak_planks', { shape: 'stairs', opaque: false, facing: true }],
    ['SPRUCE_STAIRS', 'spruce_planks', { shape: 'stairs', opaque: false, facing: true }],
    ['BIRCH_STAIRS', 'birch_planks', { shape: 'stairs', opaque: false, facing: true }],
    ['DARK_OAK_STAIRS', 'dark_oak_planks', { shape: 'stairs', opaque: false, facing: true }],
    ['QUARTZ_STAIRS', 'quartz', { shape: 'stairs', opaque: false, facing: true }],
    ['SMOOTH_QUARTZ_STAIRS', 'smooth_quartz', { shape: 'stairs', opaque: false, facing: true }],
    ['BRICK_STAIRS', 'bricks', { shape: 'stairs', opaque: false, facing: true }],
    ['NETHER_BRICK_STAIRS', 'nether_bricks', { shape: 'stairs', opaque: false, facing: true }],
    ['PRISMARINE_STAIRS', 'prismarine', { shape: 'stairs', opaque: false, facing: true }],
    ['PURPUR_STAIRS', 'purpur', { shape: 'stairs', opaque: false, facing: true }],
    ['WHITE_CONCRETE_STAIRS', 'c_white', { shape: 'stairs', opaque: false, facing: true }],
    ['GRAY_CONCRETE_STAIRS', 'c_gray', { shape: 'stairs', opaque: false, facing: true }],
    ['CYAN_CONCRETE_STAIRS', 'c_cyan', { shape: 'stairs', opaque: false, facing: true }],
    ['YELLOW_TERRACOTTA_STAIRS', 't_yellow', { shape: 'stairs', opaque: false, facing: true }],
    ['RED_TERRACOTTA_STAIRS', 't_red', { shape: 'stairs', opaque: false, facing: true }],
    ['HONEYCOMB_STAIRS', 'honeycomb', { shape: 'stairs', opaque: false, facing: true }],
    ['GRASS_STAIRS', { t: 'grass_top', b: 'dirt', s: 'grass_side' }, { shape: 'stairs', opaque: false, facing: true }],

    /* ---- slabs ------------------------------------------------------------------ */
    ['STONE_BRICK_SLAB', 'stone_bricks', { shape: 'slab', opaque: false, facing: true }],
    ['COBBLE_SLAB', 'cobble', { shape: 'slab', opaque: false, facing: true }],
    ['DEEPSLATE_BRICK_SLAB', 'deepslate_bricks', { shape: 'slab', opaque: false, facing: true }],
    ['COBBLED_DEEPSLATE_SLAB', 'cobbled_deepslate', { shape: 'slab', opaque: false, facing: true }],
    ['SMOOTH_STONE_SLAB', { t: 'smooth_stone_top', b: 'smooth_stone_top', s: 'smooth_stone' }, { shape: 'slab', opaque: false, facing: true }],
    ['ANDESITE_SLAB', 'andesite', { shape: 'slab', opaque: false, facing: true }],
    ['STONE_SLAB', 'stone', { shape: 'slab', opaque: false, facing: true }],
    ['OAK_SLAB', 'oak_planks', { shape: 'slab', opaque: false, facing: true }],
    ['SPRUCE_SLAB', 'spruce_planks', { shape: 'slab', opaque: false, facing: true }],
    ['BIRCH_SLAB', 'birch_planks', { shape: 'slab', opaque: false, facing: true }],
    ['DARK_OAK_SLAB', 'dark_oak_planks', { shape: 'slab', opaque: false, facing: true }],
    ['QUARTZ_SLAB', 'quartz', { shape: 'slab', opaque: false, facing: true }],
    ['SMOOTH_QUARTZ_SLAB', 'smooth_quartz', { shape: 'slab', opaque: false, facing: true }],
    ['BRICK_SLAB', 'bricks', { shape: 'slab', opaque: false, facing: true }],
    ['NETHER_BRICK_SLAB', 'nether_bricks', { shape: 'slab', opaque: false, facing: true }],
    ['PRISMARINE_SLAB', 'prismarine', { shape: 'slab', opaque: false, facing: true }],
    ['WHITE_CONCRETE_SLAB', 'c_white', { shape: 'slab', opaque: false, facing: true }],
    ['GRAY_CONCRETE_SLAB', 'c_gray', { shape: 'slab', opaque: false, facing: true }],
    ['CYAN_CONCRETE_SLAB', 'c_cyan', { shape: 'slab', opaque: false, facing: true }],
    ['YELLOW_TERRACOTTA_SLAB', 't_yellow', { shape: 'slab', opaque: false, facing: true }],
    ['HONEYCOMB_SLAB', 'honeycomb', { shape: 'slab', opaque: false, facing: true }],
    ['MOSSY_COBBLE_SLAB', 'mossy_cobble', { shape: 'slab', opaque: false, facing: true }],
    ['PURPUR_SLAB', 'purpur', { shape: 'slab', opaque: false, facing: true }],

    /* ---- fences / walls ---------------------------------------------------------- */
    ['OAK_FENCE', 'oak_planks', { shape: 'fence', opaque: false }],
    ['SPRUCE_FENCE', 'spruce_planks', { shape: 'fence', opaque: false }],
    ['BIRCH_FENCE', 'birch_planks', { shape: 'fence', opaque: false }],
    ['DARK_OAK_FENCE', 'dark_oak_planks', { shape: 'fence', opaque: false }],
    ['NETHER_BRICK_FENCE', 'nether_bricks', { shape: 'fence', opaque: false }],
    ['COBBLE_WALL', 'cobble', { shape: 'wall', opaque: false }],
    ['MOSSY_COBBLE_WALL', 'mossy_cobble', { shape: 'wall', opaque: false }],
    ['STONE_BRICK_WALL', 'stone_bricks', { shape: 'wall', opaque: false }],
    ['DEEPSLATE_BRICK_WALL', 'deepslate_bricks', { shape: 'wall', opaque: false }],
    ['ANDESITE_WALL', 'andesite', { shape: 'wall', opaque: false }],
    ['QUARTZ_WALL', 'quartz', { shape: 'wall', opaque: false }],

    /* ---- doors / trapdoors / gates ------------------------------------------------ */
    ['OAK_DOOR', 'door_oak', { shape: 'door', opaque: false, alpha: true, facing: true }],
    ['SPRUCE_DOOR', 'door_spruce', { shape: 'door', opaque: false, alpha: true, facing: true }],
    ['DARK_OAK_DOOR', 'door_dark_oak', { shape: 'door', opaque: false, alpha: true, facing: true }],
    ['IRON_DOOR', 'door_iron', { shape: 'door', opaque: false, alpha: true, facing: true }],
    ['OAK_TRAPDOOR', 'trapdoor_oak', { shape: 'trapdoor', opaque: false, alpha: true, facing: true }],
    ['SPRUCE_TRAPDOOR', 'trapdoor_spruce', { shape: 'trapdoor', opaque: false, alpha: true, facing: true }],
    ['DARK_OAK_TRAPDOOR', 'trapdoor_dark_oak', { shape: 'trapdoor', opaque: false, alpha: true, facing: true }],
    ['IRON_TRAPDOOR', 'trapdoor_iron', { shape: 'trapdoor', opaque: false, alpha: true, facing: true }],
    ['OAK_FENCE_GATE', 'oak_planks', { shape: 'gate', opaque: false, facing: true }],
    ['SPRUCE_FENCE_GATE', 'spruce_planks', { shape: 'gate', opaque: false, facing: true }],
    ['STONE_PLATE', 'smooth_stone', { shape: 'plate', opaque: false }],
    ['OAK_PLATE', 'oak_planks', { shape: 'plate', opaque: false }],
    ['STONE_BUTTON', 'stone', { shape: 'button', opaque: false, facing: true }],
    ['REDSTONE_WIRE', 'redstone_wire', { shape: 'rail', opaque: false, alpha: true, light: 1 }],
    ['REDSTONE_TORCH', 'redstone_torch', { shape: 'torch', light: 7, opaque: false, alpha: true }],
    ['SLIME_BLOCK', 'slime', { opaque: false, alpha: true }],

    /* ---- decorative props ---------------------------------------------------------- */
    ['BOAT', 'oak_planks', { shape: 'boat', opaque: false }],
    ['MINECART', 'iron_block', { shape: 'minecart', opaque: false }],
    ['SHULKER_BOX', { t: 'shulker_top', b: 'shulker_top', s: 'shulker_side' }, {}],
    ['CAT_STATUE', 'cat', { shape: 'critter', opaque: false, alpha: true }],
    ['WOLF_STATUE', 'wolf', { shape: 'critter', opaque: false, alpha: true }],
    ['SHEEP_BODY', 'sheep', { shape: 'critterBig', opaque: false }],
    ['COW_BODY', 'cow', { shape: 'critterBig', opaque: false }],
    ['CHICKEN_BODY', 'chicken', { shape: 'critterSmall', opaque: false }],
    ['BEE_BODY', 'bee', { shape: 'critterSmall', opaque: false, light: 2 }],
  ];

  /* ------------------------------------------------------------------ */
  /* Build lookup tables                                                 */
  /* ------------------------------------------------------------------ */
  const BLOCKS = [];   // index = id  -> definition object
  const B = {};        // NAME -> id
  const TEX_SET = [];  // ordered unique texture names
  const TEX_INDEX = {};

  function texId(name) {
    if (name == null) return 0;
    if (TEX_INDEX[name] === undefined) {
      TEX_INDEX[name] = TEX_SET.length;
      TEX_SET.push(name);
    }
    return TEX_INDEX[name];
  }

  for (let i = 0; i < D.length; i++) {
    const [name, tex, optsIn] = D[i];
    const o = optsIn || {};
    const shape = o.shape || 'full';
    let faces;
    if (tex == null) {
      faces = [0, 0, 0, 0, 0, 0];
    } else if (typeof tex === 'string') {
      const t = texId(tex);
      faces = [t, t, t, t, t, t];
    } else {
      const top = texId(tex.t || tex.s || tex.b);
      const bot = texId(tex.b || tex.t || tex.s);
      const side = texId(tex.s || tex.t || tex.b);
      // face order: +X(east) -X(west) +Y(top) -Y(bottom) +Z(south) -Z(north)
      faces = [
        texId(tex.e || tex.s || tex.t),
        texId(tex.w || tex.s || tex.t),
        top, bot,
        texId(tex.sz || tex.s || tex.t),
        texId(tex.n || tex.s || tex.t),
      ];
      void side;
    }
    const def = {
      id: i,
      name,
      faces,
      shape,
      light: o.light || 0,
      air: !!o.air,
      opaque: o.air ? false : (o.opaque !== undefined ? o.opaque : shape === 'full'),
      alpha: !!o.alpha,
      axis: !!o.axis,
      facing: !!o.facing,
      wave: !!o.wave,
      anim: o.anim || null,
      liquid: !!o.liquid,
    };
    BLOCKS.push(def);
    B[name] = i;
  }

  const API = { BLOCKS, B, TEX_SET, TEX_INDEX, COUNT: BLOCKS.length };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.MCBlocks = API;
  root.B = B;
})(typeof globalThis !== 'undefined' ? globalThis : this);
