import { ZOCCHI_SHAPE } from "./zocchihedron-shape.js";

const MODULE_ID = "gmj-dice";
const FACE_PATH = `modules/${MODULE_ID}/faces`;

/**
 * Each entry defines one custom d6.
 * faces: face value -> result. Edit a table to change which face is which.
 */
export const DICE = {
  critical: {
    name: "Critical Hit",
    denomination: "h",
    command: "/crit",
    colors: { background: "#000000", foreground: "#ffffff", edge: "#000000" },
    faces: {
      1: { label: "Stun",          img: `${FACE_PATH}/critical/stun.png` },
      2: { label: "Double Damage", img: `${FACE_PATH}/critical/double-damage.png` },
      3: { label: "Sever Limb",    img: `${FACE_PATH}/critical/sever-limb.png` },
      4: { label: "Max Damage",    img: `${FACE_PATH}/critical/max-damage.png` },
      5: { label: "Triple Damage", img: `${FACE_PATH}/critical/triple-damage.png` },
      6: { label: "Death",         img: `${FACE_PATH}/critical/death.png` }
    }
  },
  fumble: {
    name: "Fumble",
    denomination: "u",
    command: "/fumble",
    colors: { background: "#d9680c", foreground: "#000000", edge: "#d9680c" },
    faces: {
      1: { label: "Drop Weapon",  img: `${FACE_PATH}/fumble/drop-weapon.png` },
      2: { label: "Fall",         img: `${FACE_PATH}/fumble/fall.png` },
      3: { label: "Break Weapon", img: `${FACE_PATH}/fumble/break-weapon.png` },
      4: { label: "Hit Self",     img: `${FACE_PATH}/fumble/hit-self.png` },
      5: { label: "Hit Ally",     img: `${FACE_PATH}/fumble/hit-ally.png` },
      6: { label: "Knocked Out",  img: `${FACE_PATH}/fumble/knocked-out.png` }
    }
  },
  location: {
    name: "Hit Location",
    denomination: "b",
    command: "/location",
    colors: { background: "#bfbfbf", foreground: "#000000", edge: "#bfbfbf" },
    faces: {
      1: { label: "Head",      img: `${FACE_PATH}/location/head.png` },
      2: { label: "Torso",     img: `${FACE_PATH}/location/torso.png` },
      3: { label: "Right Arm", img: `${FACE_PATH}/location/right-arm.png` },
      4: { label: "Left Arm",  img: `${FACE_PATH}/location/left-arm.png` },
      5: { label: "Right Leg", img: `${FACE_PATH}/location/right-leg.png` },
      6: { label: "Left Leg",  img: `${FACE_PATH}/location/left-leg.png` }
    }
  }
};

/**
 * Automatic follow-up rolls: when a die lands on the named face,
 * roll the listed die right after it.
 */
const FOLLOW_UPS = {
  critical: { "Sever Limb": "location" }
};

const BaseDie = foundry.dice?.terms?.Die ?? globalThis.Die;

/** Build a Die subclass for one entry in DICE. */
function makeDieClass(key, def) {
  const cls = class extends BaseDie {
    constructor(termData = {}) {
      termData.faces = 6;
      super(termData);
    }

    static DENOMINATION = def.denomination;

    /** Shown in the roll tooltip instead of a number. */
    getResultLabel(result) {
      const face = def.faces[result.result];
      return face
        ? `<img class="gmj-face" src="${face.img}" alt="${face.label}" title="${face.label}">`
        : String(result.result);
    }
  };

  // Foundry and Dice So Nice! rebuild rolls by class name, so every die
  // class needs its own unique name (e.g. GMJCriticalDie, GMJFumbleDie).
  const name = `GMJ${key[0].toUpperCase()}${key.slice(1)}Die`;
  Object.defineProperty(cls, "name", { value: name });
  return cls;
}

/** Roll a special die, animate it if Dice So Nice! is active, then post a result card. */
async function rollSpecial(key, { speaker, flavor } = {}) {
  const def = DICE[key];
  if (!def) throw new Error(`${MODULE_ID} | Unknown die "${key}"`);

  const roll = await new Roll(`1d${def.denomination}`).evaluate();
  const face = def.faces[roll.total];

  if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true);

  const content = `
    <div class="gmj-card gmj-${key}">
      <img src="${face.img}" alt="${face.label}">
      <h3>${face.label}</h3>
    </div>`;

  speaker ??= ChatMessage.getSpeaker();
  const message = await ChatMessage.create({ speaker, flavor: flavor ?? def.name, content });

  const next = FOLLOW_UPS[key]?.[face.label];
  if (next) await rollSpecial(next, { speaker, flavor: `${DICE[next].name} (${face.label})` });

  return message;
}

/** Zocchihedron: a single 100-sided die, rolled with the formula 1dz. */
class GMJZocchiDie extends BaseDie {
  constructor(termData = {}) {
    termData.faces = 100;
    super(termData);
  }
  static DENOMINATION = "z";
}

/*
 * Dice So Nice! splits every 100-faced die into a tens die and a d10, so the
 * Zocchihedron is kept out of its automatic handling (results marked hidden,
 * the documented per-die skip) and shown directly with dice3d.show().
 */
const zocchiResults = (rolls = []) =>
  rolls.flatMap(r => r.dice.filter(d => d instanceof GMJZocchiDie).flatMap(d => d.results));

function showZocchi(values, { whisper = null, blind = false } = {}) {
  if (!game.dice3d || !values.length) return Promise.resolve(false);
  const data = { throws: [{ dice: values.map(v => ({
    result: v, resultLabel: String(v), type: `d${GMJZocchiDie.DENOMINATION}`, vectors: [], options: {}
  })) }] };
  return game.dice3d.show(data, game.user, true, whisper?.length ? whisper : null, blind);
}

/** Roll the Zocchihedron, animate it, then post the result. */
async function rollZocchihedron({ speaker, flavor = "Zocchihedron (d100)" } = {}) {
  const roll = await new Roll(`1d${GMJZocchiDie.DENOMINATION}`).evaluate();
  await showZocchi([roll.total]);
  return roll.toMessage({ speaker: speaker ?? ChatMessage.getSpeaker(), flavor, flags: { [MODULE_ID]: { zocchiShown: true } } });
}

Hooks.on("preCreateChatMessage", (message) => {
  const results = zocchiResults(message.rolls);
  if (!results.length) return;
  results.forEach(r => { r.hidden = true; });
  message.updateSource({ rolls: message.rolls.map(r => JSON.stringify(r)) });
});

Hooks.on("createChatMessage", (message) => {
  const author = message.author ?? message.user;
  if (author?.id !== game.user.id || message.getFlag(MODULE_ID, "zocchiShown")) return;
  const values = zocchiResults(message.rolls).map(r => r.result);
  showZocchi(values, { whisper: message.whisper, blind: message.blind });
});

Hooks.once("init", () => {
  CONFIG.Dice.terms[GMJZocchiDie.DENOMINATION] = GMJZocchiDie;
  if (CONFIG.Dice.termTypes) CONFIG.Dice.termTypes[GMJZocchiDie.name] = GMJZocchiDie;
  for (const [key, def] of Object.entries(DICE)) {
    const cls = makeDieClass(key, def);
    CONFIG.Dice.terms[def.denomination] = cls;
    if (CONFIG.Dice.termTypes) CONFIG.Dice.termTypes[cls.name] = cls;
  }
  game.modules.get(MODULE_ID).api = {
    DICE,
    rollSpecial,
    rollCriticalHit: (opts) => rollSpecial("critical", opts),
    rollFumble: (opts) => rollSpecial("fumble", opts),
    rollHitLocation: (opts) => rollSpecial("location", opts),
    rollZocchihedron
  };
});

// Macros the module creates for the GM. Icons use one face of each die.
const ICON_PATH = `modules/${MODULE_ID}/icons`;
const apiCall = (fn) => `game.modules.get("${MODULE_ID}").api.${fn}();`;
const stdRoll = (formula) => `new Roll("${formula}").toMessage({ speaker: ChatMessage.getSpeaker(), flavor: "${formula}" });`;
const MACROS = {
  critical: { name: "Roll Critical Hit", img: `${FACE_PATH}/critical/death.png`, command: apiCall("rollCriticalHit") },
  fumble:   { name: "Roll Fumble",       img: `${FACE_PATH}/fumble/fall.png`,    command: apiCall("rollFumble") },
  location: { name: "Roll Hit Location", img: `${FACE_PATH}/location/torso.png`, command: apiCall("rollHitLocation") },
  d20:  { name: "Roll 1d20",  img: `${ICON_PATH}/d20.svg`, command: stdRoll("1d20") },
  d12:  { name: "Roll 1d12",  img: `${ICON_PATH}/d12.svg`, command: stdRoll("1d12") },
  d10:  { name: "Roll 1d10",  img: `${ICON_PATH}/d10.svg`, command: stdRoll("1d10") },
  d8:   { name: "Roll 1d8",   img: `${ICON_PATH}/d8.svg`,  command: stdRoll("1d8") },
  d6:   { name: "Roll 1d6",   img: `${ICON_PATH}/d6.svg`,  command: stdRoll("1d6") },
  d4:   { name: "Roll 1d4",   img: `${ICON_PATH}/d4.svg`,  command: stdRoll("1d4") },
  d100: { name: "Roll 1d100", img: `${ICON_PATH}/d100.svg`, command: stdRoll("1d100") },
  zocchi: { name: "Roll Zocchihedron", img: `${ICON_PATH}/zocchihedron.svg`,
    command: apiCall("rollZocchihedron") }
};
const FOLDER_NAME = "GM Jeremy's Critical Hit Dice";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "createMacros", {
    name: "Create macros automatically",
    hint: "When a GM loads the world, create any missing dice macros in the Macro Directory. Turn off if you deleted macros you don't want back.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
});

/** Create any missing macros. Runs only for one active GM to avoid duplicates. */
async function ensureMacros() {
  const isLeadGM = game.users.activeGM ? game.users.activeGM.isSelf : game.user.isGM;
  if (!isLeadGM || !game.settings.get(MODULE_ID, "createMacros")) return;

  // Refresh icons on macros this module made earlier (e.g. old black dice icons),
  // but leave any icon the GM picked themselves.
  const updates = game.macros
    .filter(m => MACROS[m.getFlag(MODULE_ID, "die")] && m.img?.startsWith("icons/dice/"))
    .map(m => ({ _id: m.id, img: MACROS[m.getFlag(MODULE_ID, "die")].img }));
  // Point an older Roll Zocchihedron macro at the API so it animates correctly.
  for (const m of game.macros.filter(m => m.getFlag(MODULE_ID, "die") === "zocchi" && m.command?.includes('new Roll("1dz")'))) {
    const u = updates.find(x => x._id === m.id);
    if (u) u.command = MACROS.zocchi.command; else updates.push({ _id: m.id, command: MACROS.zocchi.command });
  }
  if (updates.length) await Macro.updateDocuments(updates);

  const existing = new Set(game.macros.map(m => m.getFlag(MODULE_ID, "die")).filter(Boolean));
  const missing = Object.keys(MACROS).filter(k => !existing.has(k));
  if (!missing.length) return;

  let folder = game.folders.find(f => f.type === "Macro" && f.getFlag(MODULE_ID, "folder"));
  folder ??= await Folder.create({ name: FOLDER_NAME, type: "Macro", flags: { [MODULE_ID]: { folder: true } } });

  const observer = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
  await Macro.createDocuments(missing.map(k => ({
    name: MACROS[k].name,
    type: "script",
    img: MACROS[k].img,
    command: MACROS[k].command,
    folder: folder.id,
    ownership: { default: observer },
    flags: { [MODULE_ID]: { die: k } }
  })));
  ui.notifications.info(`${FOLDER_NAME}: created ${missing.length} macro(s) in the Macro Directory.`);
}

Hooks.once("ready", ensureMacros);

// Chat commands such as "/crit" and "/fumble".
Hooks.on("chatMessage", (_log, message) => {
  const cmd = message.trim().toLowerCase();
  if (cmd === "/zocchi") { rollZocchihedron(); return false; }
  const key = Object.keys(DICE).find(k => DICE[k].command === cmd);
  if (!key) return true;
  rollSpecial(key);
  return false;
});

/**
 * Classic polyhedral set, based on Jeremy's Gary Con dice.
 * Each standard die type gets its own color. Pick "GM Jeremy's Classic Set"
 * as the dice preset in Dice So Nice! to use it.
 */
const CLASSIC_SYSTEM = { id: "gmj-classic", name: "GM Jeremy's Classic Set" };
const range = (n) => Array.from({ length: n }, (_, i) => String(i + 1));
const CLASSIC_DICE = {
  d4:   { background: "#eecc00", foreground: "#000000", labels: range(4) },
  d6:   { background: "#ff6347", foreground: "#000000", labels: range(6) },
  d8:   { background: "#1cc23c", foreground: "#000000", labels: range(8) },
  d10:  { background: "#e8eadd", foreground: "#000000", labels: [...range(9), "0"] },
  d12:  { background: "#4ab8ee", foreground: "#000000", labels: range(12) },
  d20:  { background: "#d81020", foreground: "#000000", labels: range(20) },
  d100: { background: "#121310", foreground: "#ffffff", labels: ["10", "20", "30", "40", "50", "60", "70", "80", "90", "00"] }
};

async function registerClassicSet(dice3d) {
  dice3d.addSystem(CLASSIC_SYSTEM, "default");
  for (const [type, d] of Object.entries(CLASSIC_DICE)) {
    const colorset = `gmj-classic-${type}`;
    dice3d.addColorset({
      name: colorset,
      description: `Classic ${type}`,
      category: "GM Jeremy's Dice",
      foreground: d.foreground,
      background: d.background,
      outline: d.background,
      edge: d.background,
      texture: "none",
      material: "plastic",
      visible: "hidden"
    }, "default");
    await dice3d.addDicePreset({ type, labels: d.labels, system: CLASSIC_SYSTEM.id, colorset });
  }
}

/*
 * EXPERIMENTAL: show the Classic Set's d10 and d100 on a 20-sided model,
 * numbered 1-0 twice, like old-style dice.
 *
 * Dice So Nice! only accepts a d10 replacement with exactly 10 values, so
 * this reshapes the already-registered 10-sided presets in place and lets
 * this one dice set skip that check. Every step is checked; if anything is
 * not as expected, the 10-sided presets are restored and a warning is logged.
 */
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "classic20", {
    name: "Show Classic d10 and d100 as 20-sided dice (experimental)",
    hint: "Draws the Classic Set's d10 and d100 on a d20 model numbered 1-0 twice. Turn off if those dice look wrong after a Dice So Nice! update.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });
});

const TWENTY_SIDED = {
  d10:  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  d100: ["10", "20", "30", "40", "50", "60", "70", "80", "90", "00"]
};

function applyClassic20(dice3d) {
  const factory = dice3d.DiceFactory ?? dice3d.dicefactory ?? dice3d.box?.dicefactory;
  const systems = factory?.systems;
  if (!systems?.get || typeof factory.getPresetBySystem !== "function") {
    throw new Error("Dice So Nice! internals not found");
  }
  const d20 = systems.get("standard")?.dice?.get("d20");
  if (!d20) throw new Error("standard d20 model not found");

  const restore = [];
  try {
    for (const [type, faceLabels] of Object.entries(TWENTY_SIDED)) {
      const preset = systems.get(CLASSIC_SYSTEM.id)?.dice?.get(type);
      const std = systems.get("standard")?.dice?.get(type);
      if (!preset || !std || typeof preset.setLabels !== "function") throw new Error(`${type} preset not found`);
      if (std.values?.length !== 10) throw new Error(`standard ${type} does not have 10 values`);

      // Map each possible result to a face 1-10 the same way the standard
      // 10-sided die does (a result of 0 counts as 10 on that die).
      const stdFace = (r) => {
        const v = r === 0 ? 10 : r;
        if (std.valueMap) return std.valueMap[v];
        const i = std.values.indexOf(v);
        return i >= 0 ? i + 1 : undefined;
      };
      const valueMap = {};
      for (const r of [0, ...std.values, ...Array.from({ length: 10 }, (_, i) => i + 1)]) {
        const f = stdFace(r);
        if (Number.isInteger(f) && f >= 1 && f <= 10) valueMap[r] = f;
      }
      if (Object.keys(valueMap).length < 10) throw new Error(`could not map ${type} results to faces`);

      restore.push({ preset, saved: {
        labels: preset.labels, shape: preset.shape, values: preset.values, valueMap: preset.valueMap,
        scale: preset.scale, mass: preset.mass, inertia: preset.inertia
      }});

      preset.setLabels([...faceLabels, ...faceLabels]);
      preset.shape = "d20";
      preset.values = Array.from({ length: 20 }, (_, i) => i + 1);
      preset.valueMap = valueMap;
      preset.scale = d20.scale * (preset.scaleModifier ?? 1);
      preset.mass = d20.mass;
      preset.inertia = d20.inertia;
    }
  } catch (err) {
    for (const { preset, saved } of restore) Object.assign(preset, saved);
    throw err;
  }

  // Let this dice set's reshaped d10/d100 through the 10-value check.
  const original = factory.getPresetBySystem.bind(factory);
  factory.getPresetBySystem = function (type, system = "standard", ...rest) {
    if (system === CLASSIC_SYSTEM.id && type in TWENTY_SIDED) {
      const preset = systems.get(system)?.dice?.get(type);
      if (preset) return preset;
    }
    return original(type, system, ...rest);
  };
}

/**
 * Zocchihedron 3D model. A golf-ball shape with 100 flat faces; the model,
 * collider and rotation table are generated by tools/build_zocchi.py.
 * Needs Dice So Nice! 6.3.0 or later (custom physics shapes).
 */
async function registerZocchihedron(dice3d) {
  if (typeof dice3d.addDiceShape !== "function") {
    console.warn(`${MODULE_ID} | Dice So Nice! is too old for custom shapes (needs 6.3.0+); the Zocchihedron will roll without a 3D model.`);
    return;
  }
  dice3d.addDiceShape(ZOCCHI_SHAPE);
  const labels = Array.from({ length: 100 }, (_, i) => String(i + 1));
  for (const system of ["standard", MODULE_ID]) {
    await dice3d.addDicePreset({
      type: `d${GMJZocchiDie.DENOMINATION}`,
      labels,
      values: { min: 1, max: 100 },
      modelFile: `modules/${MODULE_ID}/models/zocchihedron.glb`,
      system
    }, ZOCCHI_SHAPE.name);
  }
}

// 3D appearance for Dice So Nice!
Hooks.once("diceSoNiceReady", async (dice3d) => {
  await registerClassicSet(dice3d);
  if (!game.settings.get(MODULE_ID, "classic20")) return;
  try {
    applyClassic20(dice3d);
  } catch (err) {
    console.warn(`${MODULE_ID} | 20-sided Classic d10/d100 not applied, using 10-sided dice instead:`, err);
  }
});
Hooks.once("diceSoNiceReady", async (dice3d) => {
  dice3d.addSystem({ id: MODULE_ID, name: "GM Jeremy's Critical Hit Dice" }, "default");

  for (const [key, def] of Object.entries(DICE)) {
    const colorset = `gmj-${key}`;
    dice3d.addColorset({
      name: colorset,
      description: def.name,
      category: "GM Jeremy's Dice",
      foreground: def.colors.foreground,
      background: def.colors.background,
      outline: def.colors.background,
      edge: def.colors.edge,
      texture: "none",
      material: "plastic"
    }, "default");

    const labels = Object.keys(def.faces).sort((a, b) => a - b).map(k => def.faces[k].img);
    for (const system of ["standard", MODULE_ID]) {
      dice3d.addDicePreset({
        type: `d${def.denomination}`,
        labels,
        system,
        colorset
      }, "d6");
    }
  }

  // Registered after this module's dice system exists.
  try {
    await registerZocchihedron(dice3d);
  } catch (err) {
    console.warn(`${MODULE_ID} | Zocchihedron 3D model not registered:`, err);
  }
});
