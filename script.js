'use strict';

// ===== LOGGER =====
const log = (() => {
    const PREFIX = '%c[NVC]%c';
    const BASE   = 'color:#76B900;font-weight:bold';
    const RESET  = 'color:inherit;font-weight:normal';
    return {
        info:  (msg, ...a) => console.log  (`${PREFIX} ${msg}`, BASE, RESET, ...a),
        warn:  (msg, ...a) => console.warn (`${PREFIX} ${msg}`, BASE, RESET, ...a),
        error: (msg, ...a) => console.error(`${PREFIX} ${msg}`, BASE, RESET, ...a),
    };
})();

// ===== GAME DATA =====
const UPGRADES = [
    { id:  1, name: 'GeForce 256',                                       fps: 0.1,        baseCost: 15              },
    { id:  2, name: 'GeForce Ti4600',                                    fps: 0.8,        baseCost: 100             },
    { id:  3, name: 'GeForce 7800',                                      fps: 6,          baseCost: 1_100           },
    { id:  4, name: 'GeForce 8800 GTS',                                  fps: 42,         baseCost: 12_000          },
    { id:  5, name: 'GeForce GTX 670',                                   fps: 280,        baseCost: 130_000         },
    { id:  6, name: 'GeForce RTX 2080 Ti',                               fps: 1_800,      baseCost: 1_400_000       },
    { id:  7, name: 'GeForce RTX 4090',                                  fps: 12_000,     baseCost: 16_000_000      },
    { id:  8, name: 'GeForce RTX 5070 Ti',                               fps: 78_000,     baseCost: 180_000_000     },
    { id:  9, name: 'GeForce RTX 6080 SUPER',                            fps: 500_000,    baseCost: 2_000_000_000   },
    { id: 10, name: 'GeForce RTX Pro 9090 Ti SUPER TITAN XP',            fps: 3_200_000,  baseCost: 23_000_000_000  },
    { id: 11, name: 'GeForce RTX Pro 6760 Ti SUPER TITAN XP ULTRA OC',   fps: 21_000_000, baseCost: 260_000_000_000 },
    { id: 12, name: 'GeForce RTX Ultra 9900 XT',                         fps: 137_000_000,       baseCost: 2.9e12  },
    { id: 13, name: 'GeForce RTX TITAN Quantum',                         fps: 890_000_000,       baseCost: 3.2e13  },
    { id: 14, name: 'GeForce RTX OMNI 10090',                            fps: 5_800_000_000,     baseCost: 3.58e14 },
    { id: 15, name: 'GeForce RTX HYPER 11000 Ti',                        fps: 37_700_000_000,    baseCost: 4e15    },
    { id: 16, name: 'GeForce RTX NOVA 12000 SUPER',                      fps: 245_000_000_000,   baseCost: 4.5e16  },
    { id: 17, name: 'GeForce RTX COSMOS 15000 XP',                       fps: 1_590_000_000_000, baseCost: 5e17    },
    { id: 18, name: 'GeForce RTX INFINITY MAX',                          fps: 10.3e12,           baseCost: 5.6e18  },
    { id: 19, name: 'GeForce RTX NEURAL 16000 Ultra',                    fps: 67e12,             baseCost: 62e18   },
    { id: 20, name: 'GeForce RTX PHOTON 18000 Ti Max',                   fps: 435e12,            baseCost: 680e18  },
    { id: 21, name: 'GeForce RTX QUASAR 20000 SUPER OC',                 fps: 2.83e15,           baseCost: 7.5e21  },
    { id: 22, name: 'GeForce RTX PLASMA 22000 XP Ultra',                 fps: 18.4e15,           baseCost: 82e21   },
    { id: 23, name: 'GeForce RTX VORTEX 25000 Ti SUPER',                 fps: 120e15,            baseCost: 900e21  },
    { id: 24, name: 'GeForce RTX ECLIPSE 30000 TITAN OC',                fps: 780e15,            baseCost: 9.9e24  },
    { id: 25, name: 'GeForce RTX GENESIS ULTRA SUPREME MAX',             fps: 5.07e18,           baseCost: 109e24  },
];

//
// One-time upgrades.
//   type 'all'   → multiplies passive FPS AND click value
//   type 'click' → multiplies click value only
//   type 'magic' → doubles magic chip spawn rate
//   type 'gpu'   → multiplies FPS of one specific GPU tier (gpuIndex)
//
// Structure:
//   [0-23]   Base upgrades (unchanged from prior saves)
//   [24]     Quantum Luck Module (MAGIC.UPGRADE_INDEX = 24)
//   [25-87]  Leveled global upgrades II-X (7 chains × 9 = 63)
//   [88-187] GPU-specific upgrade chains I-X (10 GPUs × 10 = 100)
//
// Cost scaling for leveled globals: ~×6.5 per level from the level-I cost.
// Cost scaling for GPU chains:      baseCost × [10, 60, 350, 2k, 12k, 80k, 600k, 5M, 40M, 350M]
// GPU-specific multipliers by level: I-III ×2, IV-VI ×3, VII-VIII ×4, IX ×5, X ×8
//

// Generates levels II-X for a global upgrade chain (~×6.5 per level).
function _leveledChain(baseName, type, baseCostI, multiplier) {
    const FACTORS = [6, 40, 265, 1700, 11000, 72000, 480000, 3200000, 22000000];
    const ROMANS  = ['II','III','IV','V','VI','VII','VIII','IX','X'];
    const tip     = type === 'click'
        ? `x${multiplier} frames per click`
        : `x${multiplier} all frame generation`;
    return FACTORS.map((f, i) => ({
        name: `${baseName} ${ROMANS[i]}`, type,
        cost: Math.ceil(baseCostI * f), multiplier, tooltip: tip,
    }));
}

// Generates levels I-X for a GPU-specific upgrade chain.
// FACTORS give ~6.5× cost increase per level — consistent with GPU tier spacing.
// MULTS by tier: I-III ×2 (early), IV-VI ×3 (mid), VII-VIII ×4, IX ×5, X ×8 (endgame).
// Compound if all 10 levels owned: 2³ × 3³ × 4² × 5 × 8 = 138,240×.
function _gpuChain(gpuIndex, namePrefix, baseCost, gpuLabel) {
    const FACTORS = [10, 65, 422, 2740, 17800, 115000, 748000, 4860000, 31600000, 205000000];
    const MULTS   = [2,  2,  2,   3,    3,     3,      4,      4,       5,        8];
    const ROMANS  = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
    return MULTS.map((m, i) => ({
        name: `${namePrefix} ${ROMANS[i]}`, type: 'gpu', gpuIndex,
        cost: Math.ceil(baseCost * FACTORS[i]), multiplier: m,
        tooltip: `x${m} FPS from ${gpuLabel}`,
    }));
}

const ONE_TIME_UPGRADES = [
    // ─── Base upgrades (indices 0-23) — order must never change (save compat) ───
    { name: 'Heatsink #1',               type: 'all',   cost: 500,           multiplier: 1.25, tooltip: '+25% all frame generation'    },
    { name: 'Gaming Mouse',              type: 'click', cost: 1_500,         multiplier: 2,    tooltip: 'Doubles frames per click'     },
    { name: 'SLI Bridge',                type: 'all',   cost: 7_500,         multiplier: 1.5,  tooltip: '+50% all frame generation'    },
    { name: 'Mechanical Keyboard',       type: 'click', cost: 30_000,        multiplier: 3,    tooltip: 'Triples frames per click'     },
    { name: 'GPU Cluster',               type: 'all',   cost: 100_000,       multiplier: 2,    tooltip: 'Doubles all frame generation' },
    { name: 'Liquid Nitrogen Cooling',   type: 'all',   cost: 5_000_000,     multiplier: 2,    tooltip: 'Doubles all frame generation' },
    { name: 'Quantum Cooling',           type: 'all',   cost: 250_000_000,   multiplier: 5,    tooltip: 'x5 all frame generation'      },
    { name: 'Thermal Paste Pro',         type: 'all',   cost: 2e9,           multiplier: 1.75, tooltip: '+75% all frame generation'    },
    { name: 'Neural Click Interface',    type: 'click', cost: 6e9,           multiplier: 5,    tooltip: 'x5 frames per click'         },
    { name: 'Phase-Change Unit',         type: 'all',   cost: 2.5e10,        multiplier: 2,    tooltip: 'Doubles all frame generation' },
    { name: 'LN2 Loop',                  type: 'all',   cost: 6e11,          multiplier: 2,    tooltip: 'Doubles all frame generation' },
    { name: 'Turbo Neural Click',        type: 'click', cost: 2e12,          multiplier: 8,    tooltip: 'x8 frames per click'         },
    { name: 'Superconductor Array',      type: 'all',   cost: 7e12,          multiplier: 2,    tooltip: 'Doubles all frame generation' },
    { name: 'Antimatter Heatsink',       type: 'all',   cost: 8e13,          multiplier: 2,    tooltip: 'Doubles all frame generation' },
    { name: 'Dimensional Shader Core',   type: 'all',   cost: 3e14,          multiplier: 3,    tooltip: 'x3 all frame generation'      },
    { name: 'Zero-Point Cooler',         type: 'all',   cost: 1e15,          multiplier: 2,    tooltip: 'Doubles all frame generation' },
    { name: 'Warp Core Fans',            type: 'all',   cost: 1.2e16,        multiplier: 3,    tooltip: 'x3 all frame generation'      },
    { name: 'Temporal Frame Buffer',     type: 'all',   cost: 5e16,          multiplier: 2,    tooltip: 'Doubles all frame generation' },
    { name: 'Dark Matter Sink',          type: 'all',   cost: 1.5e17,        multiplier: 3,    tooltip: 'x3 all frame generation'      },
    { name: 'Omega Click Transcendence', type: 'click', cost: 6e17,          multiplier: 10,   tooltip: 'x10 frames per click'        },
    { name: 'Quantum Entanglement Mesh', type: 'all',   cost: 2e18,          multiplier: 5,    tooltip: 'x5 all frame generation'      },
    { name: 'Singularity Core',          type: 'all',   cost: 2.5e19,        multiplier: 5,    tooltip: 'x5 all frame generation'      },
    { name: 'Void Renderer Array',       type: 'all',   cost: 1e20,          multiplier: 5,    tooltip: 'x5 all frame generation'      },
    { name: 'Photon Nexus Engine',       type: 'all',   cost: 8e20,          multiplier: 8,    tooltip: 'x8 all frame generation'      },
    // ─── Magic chip upgrade (index 24 = MAGIC.UPGRADE_INDEX) ────────────────────
    { name: 'Quantum Luck Module',       type: 'magic', cost: 500_000_000,   multiplier: 1,    tooltip: 'Doubles Magic Chip spawn rate' },
    // ─── Leveled global upgrades: II–X (indices 25–87) ──────────────────────────
    ..._leveledChain('Heatsink',                'all',   500,         1.25),
    ..._leveledChain('Gaming Mouse',            'click', 1_500,       2   ),
    ..._leveledChain('SLI Bridge',              'all',   7_500,       1.5 ),
    ..._leveledChain('Mechanical Keyboard',     'click', 30_000,      3   ),
    ..._leveledChain('GPU Cluster',             'all',   100_000,     2   ),
    ..._leveledChain('Liquid Nitrogen Cooling', 'all',   5_000_000,   2   ),
    ..._leveledChain('Quantum Cooling',         'all',   250_000_000, 5   ),
    // ─── GPU-specific chains: I–X (indices 88–187) ──────────────────────────────
    ..._gpuChain( 0, '256 Overclock',    15,         'GeForce 256'                          ),
    ..._gpuChain( 2, '7800 Tuning',      1_100,      'GeForce 7800'                         ),
    ..._gpuChain( 4, 'GTX 670 Boost',    130_000,    'GeForce GTX 670'                      ),
    ..._gpuChain( 6, 'RTX 4090 Tune',    16_000_000, 'GeForce RTX 4090'                     ),
    ..._gpuChain( 8, '6080 SUPER Core',  2e9,        'GeForce RTX 6080 SUPER'               ),
    ..._gpuChain(11, '9900 XT Boost',    2.9e12,     'GeForce RTX Ultra 9900 XT'            ),
    ..._gpuChain(14, 'HYPER 11000 OC',   4e15,       'GeForce RTX HYPER 11000 Ti'           ),
    ..._gpuChain(17, 'INFINITY Tune',    5.6e18,     'GeForce RTX INFINITY MAX'             ),
    ..._gpuChain(20, 'QUASAR Boost',     7.5e21,     'GeForce RTX QUASAR 20000 SUPER OC'   ),
    ..._gpuChain(23, 'ECLIPSE Core',     9.9e24,     'GeForce RTX ECLIPSE 30000 TITAN OC'  ),
];

// ===== MAGIC CHIP CONFIG =====
// Very rare event. Base ~60 min, halved with Quantum Luck Module.
const MAGIC = {
    DEFAULT_INTERVAL_S:  3600,  // ~60 min
    UPGRADED_INTERVAL_S: 1800,  // ~30 min with upgrade
    JITTER:              0.4,   // ±20% randomness
    DURATION_S:          5,     // seconds chip stays visible
    BUFF_MULTIPLIER:     5,     // x5 to ALL generation while active
    BUFF_DURATION_S:     30,    // duration of buff in seconds
    UPGRADE_INDEX:       24,    // index of Quantum Luck Module in ONE_TIME_UPGRADES
};

const SAVE_KEY     = 'nvidiaClickerSave';
const SETTINGS_KEY = 'nvidiaClickerSettings';
const SAVE_INTERVAL_MS = 5000;

// ===== COST SCALING =====
function costScaleFor(baseCost) {
    const MIN_SCALE = 1.115, MAX_SCALE = 1.180;
    const LOG_MIN   = Math.log10(15), LOG_MAX = Math.log10(109e24);
    const t = Math.min(1, Math.max(0, (Math.log10(Math.max(1, baseCost)) - LOG_MIN) / (LOG_MAX - LOG_MIN)));
    return MIN_SCALE + t * (MAX_SCALE - MIN_SCALE);
}

function costAfterN(baseCost, bought) {
    if (bought === 0) return baseCost;
    return Math.ceil(baseCost * Math.pow(costScaleFor(baseCost), bought));
}

// ===== NUMBER FORMATTING =====
// 102 entries (index i = 10^(3i)), covering 10^0 → 10^303 (centillion).
// Naming after Dc:
//   Units prefix: U=un D=duo T=tre Qa=quattuor Qi=quin Sx=sex Sp=septen Oc=octo No=novem
//   Tens root:    Dc=decillion Vg=vigintillion Tg=trigintillion Qag=quadragintillion
//                 Qig=quinquagintillion Sxg=sexagintillion Spg=septuagintillion
//                 Ocg=octogintillion Nog=nonagintillion  Ct=centillion
const SUFFIXES = [
    /* 10^0   */ '',
    /* 10^3   */ 'k',
    /* 10^6   */ 'M',
    /* 10^9   */ 'B',
    /* 10^12  */ 'T',
    /* 10^15  */ 'Qa',
    /* 10^18  */ 'Qi',
    /* 10^21  */ 'Sx',
    /* 10^24  */ 'Sp',
    /* 10^27  */ 'Oc',
    /* 10^30  */ 'No',
    /* 10^33  */ 'Dc',
    /* 10^36  */ 'UDc',
    /* 10^39  */ 'DDc',
    /* 10^42  */ 'TDc',
    /* 10^45  */ 'QaDc',
    /* 10^48  */ 'QiDc',
    /* 10^51  */ 'SxDc',
    /* 10^54  */ 'SpDc',
    /* 10^57  */ 'OcDc',
    /* 10^60  */ 'NoDc',
    /* 10^63  */ 'Vg',
    /* 10^66  */ 'UVg',
    /* 10^69  */ 'DVg',
    /* 10^72  */ 'TVg',
    /* 10^75  */ 'QaVg',
    /* 10^78  */ 'QiVg',
    /* 10^81  */ 'SxVg',
    /* 10^84  */ 'SpVg',
    /* 10^87  */ 'OcVg',
    /* 10^90  */ 'NoVg',
    /* 10^93  */ 'Tg',
    /* 10^96  */ 'UTg',
    /* 10^99  */ 'DTg',
    /* 10^102 */ 'TTg',
    /* 10^105 */ 'QaTg',
    /* 10^108 */ 'QiTg',
    /* 10^111 */ 'SxTg',
    /* 10^114 */ 'SpTg',
    /* 10^117 */ 'OcTg',
    /* 10^120 */ 'NoTg',
    /* 10^123 */ 'Qag',
    /* 10^126 */ 'UQag',
    /* 10^129 */ 'DQag',
    /* 10^132 */ 'TQag',
    /* 10^135 */ 'QaQag',
    /* 10^138 */ 'QiQag',
    /* 10^141 */ 'SxQag',
    /* 10^144 */ 'SpQag',
    /* 10^147 */ 'OcQag',
    /* 10^150 */ 'NoQag',
    /* 10^153 */ 'Qig',
    /* 10^156 */ 'UQig',
    /* 10^159 */ 'DQig',
    /* 10^162 */ 'TQig',
    /* 10^165 */ 'QaQig',
    /* 10^168 */ 'QiQig',
    /* 10^171 */ 'SxQig',
    /* 10^174 */ 'SpQig',
    /* 10^177 */ 'OcQig',
    /* 10^180 */ 'NoQig',
    /* 10^183 */ 'Sxg',
    /* 10^186 */ 'USxg',
    /* 10^189 */ 'DSxg',
    /* 10^192 */ 'TSxg',
    /* 10^195 */ 'QaSxg',
    /* 10^198 */ 'QiSxg',
    /* 10^201 */ 'SxSxg',
    /* 10^204 */ 'SpSxg',
    /* 10^207 */ 'OcSxg',
    /* 10^210 */ 'NoSxg',
    /* 10^213 */ 'Spg',
    /* 10^216 */ 'USpg',
    /* 10^219 */ 'DSpg',
    /* 10^222 */ 'TSpg',
    /* 10^225 */ 'QaSpg',
    /* 10^228 */ 'QiSpg',
    /* 10^231 */ 'SxSpg',
    /* 10^234 */ 'SpSpg',
    /* 10^237 */ 'OcSpg',
    /* 10^240 */ 'NoSpg',
    /* 10^243 */ 'Ocg',
    /* 10^246 */ 'UOcg',
    /* 10^249 */ 'DOcg',
    /* 10^252 */ 'TOcg',
    /* 10^255 */ 'QaOcg',
    /* 10^258 */ 'QiOcg',
    /* 10^261 */ 'SxOcg',
    /* 10^264 */ 'SpOcg',
    /* 10^267 */ 'OcOcg',
    /* 10^270 */ 'NoOcg',
    /* 10^273 */ 'Nog',
    /* 10^276 */ 'UNog',
    /* 10^279 */ 'DNog',
    /* 10^282 */ 'TNog',
    /* 10^285 */ 'QaNog',
    /* 10^288 */ 'QiNog',
    /* 10^291 */ 'SxNog',
    /* 10^294 */ 'SpNog',
    /* 10^297 */ 'OcNog',
    /* 10^300 */ 'NoNog',
    /* 10^303 */ 'Ct',
];

function shortenNumber(num) {
    if (!isFinite(num) || isNaN(num) || num < 0) return '0';
    let idx = 0;
    while (num >= 1000 && idx < SUFFIXES.length - 1) { num /= 1000; idx++; }
    return (num < 10 ? num.toFixed(1) : num.toFixed(0)) + SUFFIXES[idx];
}

function fmtMultBadge(multiplier, type) {
    if (type === 'chip')  return 'Chip+';
    if (type === 'magic') return 'Magic+';
    const s = Number.isInteger(multiplier)
        ? String(multiplier)
        : parseFloat(multiplier.toFixed(4)).toString();
    if (type === 'gpu')   return `x${s} GPU`;
    return type === 'click' ? `x${s} Click` : `x${s} Frames`;
}

function formatTime(totalSecs) {
    const s = Math.floor(totalSecs);
    if (s < 60)   return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

// ===== SETTINGS =====
function defaultSettings() {
    return {
        particles: true,
        titleFPS:  false,   // show frames in title by default
        showStats: false,   // stats panel hidden by default
    };
}

// ===== DEFAULT GAME STATE =====
function defaultState() {
    return {
        frames:            0,
        totalFramesEarned: 0,
        totalClicks:       0,
        peakFPS:           0,
        upgrades:          UPGRADES.map(() => ({ bought: 0 })),
        oneTimeBought:     new Array(ONE_TIME_UPGRADES.length).fill(false),
    };
}

// ===== CUSTOM ERROR =====
class GameError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'GameError';
        this.code = code;
    }
}

// ===== UPGRADE MANAGER =====
class UpgradeManager {
    constructor(state) { this.state = state; }

    priceOf(index) {
        const u = UPGRADES[index];
        if (!u) throw new GameError('INVALID_INDEX', `No upgrade at index ${index}`);
        return costAfterN(u.baseCost, this.state.upgrades[index].bought);
    }

    boughtOf(index) { return this.state.upgrades[index]?.bought ?? 0; }

    totalRawFPS() {
        // Pre-compute per-GPU multipliers from owned 'gpu' type one-time upgrades
        const gpuMults = new Array(UPGRADES.length).fill(1);
        ONE_TIME_UPGRADES.forEach((u, i) => {
            if (u.type === 'gpu' && this.state.oneTimeBought[i])
                gpuMults[u.gpuIndex] = (gpuMults[u.gpuIndex] || 1) * u.multiplier;
        });
        return UPGRADES.reduce((sum, u, i) => sum + this.boughtOf(i) * u.fps * gpuMults[i], 0);
    }

    totalOwned() {
        return this.state.upgrades.reduce((s, u) => s + u.bought, 0);
    }

    purchase(index, currentFrames) {
        if (index < 0 || index >= UPGRADES.length)
            throw new GameError('INVALID_INDEX', `Upgrade index out of range: ${index}`);
        const cost = this.priceOf(index);
        if (currentFrames < cost)
            throw new GameError('INSUFFICIENT_FUNDS', `Need ${shortenNumber(cost)}, have ${shortenNumber(currentFrames)}`);
        this.state.upgrades[index].bought++;
        log.info(`Bought ${UPGRADES[index].name} (x${this.state.upgrades[index].bought}), paid ${shortenNumber(cost)}, next ${shortenNumber(this.priceOf(index))}`);
        return { ok: true, cost };
    }
}

// ===== MAIN GAME CLASS =====
class NvidiaClicker {
    constructor() {
        this.state    = defaultState();
        this.settings = defaultSettings();
        this.upgMgr   = null;

        this.lastTickTime = performance.now();
        this.sessionStart = Date.now();
        this.toastTimer   = null;

        // Magic chip (runtime-only state, never persisted)
        this.magicSpawnTimer  = null;
        this.magicHideTimer   = null;
        this.magicVisible     = false;
        this.activeBuff       = null; // { expiresAt: ms } or null

        this.loadSettings();
        this.loadGame();
        this.upgMgr = new UpgradeManager(this.state);

        this.buildUI();
        this.bindEvents();
        this.applySettings();
        this.updateDisplay();

        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);

        setInterval(() => this.saveGame(), SAVE_INTERVAL_MS);
        this._scheduleMagicChip();

        log.info(`Init — frames: ${shortenNumber(this.state.frames)}, FPS: ${shortenNumber(this.calcFPS())}, passive x${this.calcPassiveMultiplier().toFixed(2)}, click x${this.calcClickMultiplier().toFixed(2)}`);
        log.info(`Magic chip: next spawn in ~${(this.magicIntervalS()/60).toFixed(0)} min (upgrade: ${this.magicHasUpgrade()})`);

        console.groupCollapsed('%c[NVC] GPU tier table', 'color:#76B900;font-weight:bold');
        console.table(UPGRADES.map(u => ({
            name: u.name, fps: u.fps, baseCost: u.baseCost,
            'payback(s)': +(u.baseCost / u.fps).toFixed(0),
            'scale×': +costScaleFor(u.baseCost).toFixed(4),
        })));
        console.groupEnd();
    }

    // ─────────────── GAME LOOP ───────────────
    _loop(now) {
        const delta = (now - this.lastTickTime) / 1000;
        this.lastTickTime = now;

        const fps = this.calcFPS();
        if (fps > 0) {
            const earned = fps * delta;
            this.state.frames            += earned;
            this.state.totalFramesEarned += earned;
            if (fps > this.state.peakFPS) this.state.peakFPS = fps;
            this.updateDisplay();
        }

        requestAnimationFrame(this._loop);
    }

    // ─────────────── MULTIPLIERS ───────────────
    /** Passive (FPS) multiplier: 'all' upgrades + active magic buff. */
    calcPassiveMultiplier() {
        let m = ONE_TIME_UPGRADES.reduce(
            (acc, u, i) => (this.state.oneTimeBought[i] && u.type === 'all') ? acc * u.multiplier : acc,
            1
        );
        if (this.activeBuff && Date.now() < this.activeBuff.expiresAt)
            m *= MAGIC.BUFF_MULTIPLIER;
        return m;
    }

    /** Click multiplier: 'all' + 'click' upgrades + active magic buff. */
    calcClickMultiplier() {
        let m = ONE_TIME_UPGRADES.reduce(
            (acc, u, i) => (this.state.oneTimeBought[i] && (u.type === 'all' || u.type === 'click')) ? acc * u.multiplier : acc,
            1
        );
        if (this.activeBuff && Date.now() < this.activeBuff.expiresAt)
            m *= MAGIC.BUFF_MULTIPLIER;
        return m;
    }

    calcFPS()        { return this.upgMgr.totalRawFPS() * this.calcPassiveMultiplier(); }
    calcClickValue() { return 1 * this.calcClickMultiplier(); }

    magicHasUpgrade() { return !!this.state.oneTimeBought[MAGIC.UPGRADE_INDEX]; }
    magicIntervalS()  { return this.magicHasUpgrade() ? MAGIC.UPGRADED_INTERVAL_S : MAGIC.DEFAULT_INTERVAL_S; }

    // ─────────────── UI BUILD ───────────────
    buildUI() {
        this._buildRegularUpgrades();
        this._buildOneTimeUpgrades();
        this._revealUnlockedUpgrades();
    }

    _buildRegularUpgrades() {
        const container = document.getElementById('regularUpgradesContainer');
        if (!container) { log.error('regularUpgradesContainer not found'); return; }

        UPGRADES.forEach((u, i) => {
            const item = document.createElement('div');
            item.className = 'upgrade-item';
            item.id = `upgItem_${i}`;
            if (i > 0) item.style.display = 'none';
            item.innerHTML = `
                <button class="upgradeButton" id="upg_${i}" aria-label="${u.name}">
                    <span class="upg-name">${u.name}</span>
                    <span class="upg-meta">
                        <span class="upg-fps-label">+${shortenNumber(u.fps)}/s each</span>
                        <span class="upg-badge" id="upgBadge_${i}">0</span>
                    </span>
                    <span class="tooltip">+${shortenNumber(u.fps)} FPS each</span>
                </button>
                <span class="upgradePrice" id="upgPrice_${i}">–</span>
            `;
            container.appendChild(item);
        });
    }

    _buildOneTimeUpgrades() {
        const container = document.getElementById('oneTimeUpgradesContainer');
        if (!container) { log.error('oneTimeUpgradesContainer not found'); return; }

        ONE_TIME_UPGRADES.forEach((u, i) => {
            const item = document.createElement('div');
            item.className = 'upgrade-item';
            item.id = `otItem_${i}`;
            const badgeClass = { click: 'ot-mult-badge ot-badge--click', chip: 'ot-mult-badge ot-badge--chip', magic: 'ot-mult-badge ot-badge--magic', gpu: 'ot-mult-badge ot-badge--gpu' }[u.type] || 'ot-mult-badge';
            item.innerHTML = `
                <button class="oneTimeUpgradeButton" id="ot_${i}" aria-label="${u.name}: ${u.tooltip}">
                    <span class="upg-name">${u.name}</span>
                    <span class="${badgeClass}">${fmtMultBadge(u.multiplier, u.type)}</span>
                    <span class="tooltip">${u.tooltip}</span>
                </button>
                <span class="oneTimeUpgradePrice" id="otPrice_${i}">–</span>
            `;
            container.appendChild(item);
        });
    }

    _revealUnlockedUpgrades() {
        UPGRADES.forEach((_, i) => {
            if (i === 0) return;
            const el = document.getElementById(`upgItem_${i}`);
            if (el && this.state.upgrades[i - 1].bought > 0) el.style.display = 'flex';
        });
        // All non-purchased one-time upgrades start hidden;
        // updateDisplay() reveals only the ones the player can currently afford.
        ONE_TIME_UPGRADES.forEach((_, i) => {
            const el = document.getElementById(`otItem_${i}`);
            if (el) el.style.display = 'none';
        });
    }

    // ─────────────── EVENTS ───────────────
    bindEvents() {
        // Clicker
        const clicker = document.getElementById('clicker');
        clicker.addEventListener('click', e => this._handleClick(e));
        clicker.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._handleClick(e); }
        });

        // Magic chip
        const magic = document.getElementById('magicChip');
        if (magic) {
            magic.addEventListener('click',   e => { e.stopPropagation(); this._collectMagicChip(); });
            magic.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._collectMagicChip(); }
            });
        }

        // Upgrade purchase (delegation)
        document.getElementById('regularUpgradesContainer').addEventListener('click', e => {
            const btn = e.target.closest('.upgradeButton');
            if (!btn) return;
            this.purchaseUpgrade(parseInt(btn.id.replace('upg_', ''), 10));
        });
        document.getElementById('oneTimeUpgradesContainer').addEventListener('click', e => {
            const btn = e.target.closest('.oneTimeUpgradeButton');
            if (!btn) return;
            this.purchaseOneTime(parseInt(btn.id.replace('ot_', ''), 10));
        });

        // Burger menu
        const menuButton = document.getElementById('menuButton');
        const menuItems  = document.getElementById('menuItems');
        menuButton.addEventListener('click', e => {
            e.stopPropagation();
            const open = menuItems.classList.toggle('open');
            menuButton.setAttribute('aria-expanded', open);
        });
        document.addEventListener('click', () => {
            menuItems.classList.remove('open');
            menuButton.setAttribute('aria-expanded', 'false');
        });

        document.getElementById('resetSave').addEventListener('click', () => {
            if (confirm('Reset your save? This cannot be undone!')) {
                localStorage.removeItem(SAVE_KEY);
                location.reload();
            }
        });

        // Settings modal
        document.getElementById('openSettings').addEventListener('click', e => {
            e.stopPropagation();
            menuItems.classList.remove('open');
            this._openSettings();
        });
        document.getElementById('closeSettings').addEventListener('click', () => this._closeSettings());
        document.getElementById('settingsModal').addEventListener('click', e => {
            if (e.target === e.currentTarget) this._closeSettings();
        });

        // Settings toggles
        document.getElementById('set-particles').addEventListener('change', e => {
            this.settings.particles = e.target.checked;
            this.saveSettings();
            log.info('Setting particles:', this.settings.particles);
        });
        document.getElementById('set-titleFPS').addEventListener('change', e => {
            this.settings.titleFPS = e.target.checked;
            this.saveSettings();
            log.info('Setting titleFPS:', this.settings.titleFPS);
        });
        document.getElementById('set-showStats').addEventListener('change', e => {
            this.settings.showStats = e.target.checked;
            this._applyStatsVisibility();
            this.saveSettings();
            log.info('Setting showStats:', this.settings.showStats);
        });
    }

    _openSettings() {
        const m = document.getElementById('settingsModal');
        m.removeAttribute('hidden');
        m.classList.add('open');
    }
    _closeSettings() {
        const m = document.getElementById('settingsModal');
        m.setAttribute('hidden', '');
        m.classList.remove('open');
    }

    applySettings() {
        document.getElementById('set-particles').checked = this.settings.particles;
        document.getElementById('set-titleFPS').checked  = this.settings.titleFPS;
        document.getElementById('set-showStats').checked = this.settings.showStats;
        this._applyStatsVisibility();
    }

    _applyStatsVisibility() {
        const panel = document.getElementById('statsPanel');
        if (panel) panel.classList.toggle('stats-visible', !!this.settings.showStats);
    }

    // ─────────────── CLICK HANDLER ───────────────
    _handleClick(e) {
        const val = this.calcClickValue();
        this.state.frames            += val;
        this.state.totalFramesEarned += val;
        this.state.totalClicks++;
        this.updateDisplay();
        if (this.settings.particles) this._spawnParticle(val, e, '');
    }

    _spawnParticle(val, e, cssClass) {
        const p = document.createElement('div');
        p.className = 'particle' + (cssClass ? ' ' + cssClass : '');
        p.textContent = val > 0 ? '+' + shortenNumber(val) : `x${MAGIC.BUFF_MULTIPLIER} BUFF`;

        let x, y;
        if (e?.clientX != null) {
            x = e.clientX + (Math.random() - 0.5) * 40;
            y = e.clientY + (Math.random() - 0.5) * 20;
        } else {
            const rect = document.getElementById('clicker').getBoundingClientRect();
            x = rect.left + rect.width  / 2;
            y = rect.top  + rect.height / 2;
        }
        p.style.left = x + 'px';
        p.style.top  = y + 'px';
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1400);
    }

    _particleFromEl(elId, val, cssClass) {
        const el = document.getElementById(elId);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        this._spawnParticle(val, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, cssClass);
    }

    // ─────────────── MAGIC CHIP ───────────────
    _scheduleMagicChip() {
        clearTimeout(this.magicSpawnTimer);
        const base   = this.magicIntervalS() * 1000;
        const jitter = (Math.random() - 0.5) * base * MAGIC.JITTER;
        const delay  = Math.max(15_000, base + jitter);
        log.info(`Magic chip scheduled in ${(delay / 60000).toFixed(1)} min`);
        this.magicSpawnTimer = setTimeout(() => this._showMagicChip(), delay);
    }

    _showMagicChip() {
        if (this.magicVisible) return;
        this.magicVisible = true;

        const el   = document.getElementById('magicChip');
        const zone = document.getElementById('magicSpawnZone');
        if (!el || !zone) return;

        const CHIP_W = 80, CHIP_H = 80;
        const zW = zone.offsetWidth  || 300;
        const zH = zone.offsetHeight || 160;

        el.style.left = Math.max(0, Math.random() * (zW - CHIP_W)) + 'px';
        el.style.top  = Math.max(0, Math.random() * (zH - CHIP_H)) + 'px';
        el.removeAttribute('hidden');

        log.info(`Magic chip appeared! x${MAGIC.BUFF_MULTIPLIER} buff on collect for ${MAGIC.BUFF_DURATION_S}s.`);

        this.magicHideTimer = setTimeout(() => this._hideMagicChip(false), MAGIC.DURATION_S * 1000);
    }

    _hideMagicChip(collected) {
        clearTimeout(this.magicHideTimer);
        const el = document.getElementById('magicChip');
        if (el) el.setAttribute('hidden', '');
        this.magicVisible = false;
        if (!collected) log.info('Magic chip: expired uncollected.');
        this._scheduleMagicChip();
    }

    _collectMagicChip() {
        if (!this.magicVisible) return;

        const expiresAt = Date.now() + MAGIC.BUFF_DURATION_S * 1000;
        this.activeBuff = { expiresAt };

        log.info(`Magic chip collected! x${MAGIC.BUFF_MULTIPLIER} buff active until ${new Date(expiresAt).toLocaleTimeString()}`);
        this._showToast(`x${MAGIC.BUFF_MULTIPLIER} frames for ${MAGIC.BUFF_DURATION_S}s!`, 'magic');
        this._particleFromEl('magicChip', 0, 'particle-magic');
        this._startBuffIndicator();
        this._hideMagicChip(true);
        this.updateDisplay();
    }

    // ─────────────── BUFF INDICATOR ───────────────
    _startBuffIndicator() {
        const bar   = document.getElementById('buffBar');
        const label = document.getElementById('buffLabel');
        const fill  = document.getElementById('buffFill');
        if (!bar) return;

        bar.removeAttribute('hidden');

        const tick = () => {
            if (!this.activeBuff || Date.now() >= this.activeBuff.expiresAt) {
                this.activeBuff = null;
                if (bar) bar.setAttribute('hidden', '');
                log.info('Magic chip buff expired.');
                return;
            }
            const remaining = (this.activeBuff.expiresAt - Date.now()) / 1000;
            const progress  = remaining / MAGIC.BUFF_DURATION_S;
            if (label) label.textContent = `x${MAGIC.BUFF_MULTIPLIER} BUFF — ${Math.ceil(remaining)}s`;
            if (fill)  fill.style.transform = `scaleX(${Math.max(0, progress)})`;
            setTimeout(tick, 200);
        };
        tick();
    }

    // ─────────────── PURCHASES ───────────────
    purchaseUpgrade(index) {
        try {
            const { cost } = this.upgMgr.purchase(index, this.state.frames);
            this.state.frames -= cost;
            const nextEl = document.getElementById(`upgItem_${index + 1}`);
            if (nextEl && nextEl.style.display === 'none') {
                nextEl.style.display = 'flex';
                log.info(`Unlocked: ${UPGRADES[index + 1]?.name}`);
            }
            this.updateDisplay();
        } catch (err) {
            if (err instanceof GameError && err.code === 'INSUFFICIENT_FUNDS') this._showToast('Not enough frames!');
            else { log.error('purchaseUpgrade failed:', err.message); this._showToast('Purchase failed.'); }
        }
    }

    purchaseOneTime(index) {
        try {
            if (index < 0 || index >= ONE_TIME_UPGRADES.length)
                throw new GameError('INVALID_INDEX', `OT index out of range: ${index}`);
            if (this.state.oneTimeBought[index])
                throw new GameError('ALREADY_OWNED', 'Already purchased');
            const cost = ONE_TIME_UPGRADES[index].cost;
            if (this.state.frames < cost)
                throw new GameError('INSUFFICIENT_FUNDS', `Need ${shortenNumber(cost)}`);

            this.state.frames -= cost;
            this.state.oneTimeBought[index] = true;
            const el = document.getElementById(`otItem_${index}`);
            if (el) el.style.display = 'none';

            // Reschedule magic chip at new (halved) interval immediately
            if (index === MAGIC.UPGRADE_INDEX) {
                log.info('Quantum Luck Module purchased — rescheduling magic chip at halved interval');
                clearTimeout(this.magicSpawnTimer);
                this._scheduleMagicChip();
            }

            log.info(`Purchased one-time: ${ONE_TIME_UPGRADES[index].name}`);
            this.updateDisplay();
        } catch (err) {
            if (err instanceof GameError && err.code === 'INSUFFICIENT_FUNDS') this._showToast('Not enough frames!');
            else if (err instanceof GameError && err.code === 'ALREADY_OWNED') { /* silent */ }
            else { log.error('purchaseOneTime failed:', err.message); this._showToast('Purchase failed.'); }
        }
    }

    // ─────────────── DISPLAY ───────────────
    updateDisplay() {
        const fps = this.calcFPS();

        this._setText('framesValue', shortenNumber(this.state.frames));
        this._setText('fpsValue',    shortenNumber(fps));

        document.title = this.settings.titleFPS
            ? `${shortenNumber(fps)}/s – NVIDIA Clicker`
            : `${shortenNumber(this.state.frames)} Frames – NVIDIA Clicker`;

        UPGRADES.forEach((_, i) => {
            const btn     = document.getElementById(`upg_${i}`);
            const priceEl = document.getElementById(`upgPrice_${i}`);
            const badge   = document.getElementById(`upgBadge_${i}`);
            if (!btn || !priceEl) return;
            const cost  = this.upgMgr.priceOf(i);
            const owned = this.upgMgr.boughtOf(i);
            priceEl.textContent = shortenNumber(cost);
            btn.disabled = this.state.frames < cost;
            if (badge) { badge.textContent = owned; badge.classList.toggle('has-items', owned > 0); }
        });

        // One-time upgrades: show only if affordable and not yet purchased
        ONE_TIME_UPGRADES.forEach((u, i) => {
            const item = document.getElementById(`otItem_${i}`);
            if (!item) return;
            if (this.state.oneTimeBought[i]) { item.style.display = 'none'; return; }

            const canAfford = this.state.frames >= u.cost;
            item.style.display = canAfford ? 'flex' : 'none';

            if (canAfford) {
                const btn     = document.getElementById(`ot_${i}`);
                const priceEl = document.getElementById(`otPrice_${i}`);
                if (btn)     btn.disabled        = false;
                if (priceEl) priceEl.textContent = shortenNumber(u.cost);
            }
        });

        if (this.settings.showStats) this._updateStats(fps);
    }

    _updateStats(fps) {
        if (fps > this.state.peakFPS) this.state.peakFPS = fps;
        const buffActive  = this.activeBuff && Date.now() < this.activeBuff.expiresAt;
        const buffMult    = buffActive ? MAGIC.BUFF_MULTIPLIER : 1;
        const basePassive = this.calcPassiveMultiplier() / buffMult;
        const baseClick   = this.calcClickMultiplier()   / buffMult;

        this._setText('stat-totalFrames', shortenNumber(this.state.totalFramesEarned));
        this._setText('stat-totalClicks', this.state.totalClicks.toLocaleString());
        this._setText('stat-clickValue',  shortenNumber(this.calcClickValue()) + ' / click');
        this._setText('stat-passiveMult', 'x' + shortenNumber(basePassive));
        this._setText('stat-clickMult',   'x' + shortenNumber(baseClick));
        this._setText('stat-gpusOwned',   this.upgMgr.totalOwned().toLocaleString());
        this._setText('stat-peakFPS',     shortenNumber(this.state.peakFPS) + ' / s');
        this._setText('stat-boosters',    `${this.state.oneTimeBought.filter(Boolean).length} / ${ONE_TIME_UPGRADES.length}`);
        this._setText('stat-sessionTime', formatTime((Date.now() - this.sessionStart) / 1000));
        this._setText('stat-magicRate',   `~${(this.magicIntervalS() / 60).toFixed(0)} min`);
    }

    _setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // ─────────────── TOAST ───────────────
    _showToast(msg, type = 'error') {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.dataset.type = type;
        toast.classList.add('show');
        clearTimeout(this.toastTimer);
        const dur = type === 'magic' ? 4000 : type === 'chip' ? 3000 : 2000;
        this.toastTimer = setTimeout(() => toast.classList.remove('show'), dur);
    }

    // ─────────────── SETTINGS ───────────────
    loadSettings() {
        try {
            const raw = localStorage.getItem(SETTINGS_KEY);
            if (!raw) return;
            this.settings = { ...defaultSettings(), ...JSON.parse(raw) };
            log.info('Settings loaded:', this.settings);
        } catch (err) {
            log.warn('Settings load failed, using defaults:', err.message);
            this.settings = defaultSettings();
        }
    }

    saveSettings() {
        try {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
        } catch (err) {
            log.warn('Settings save failed:', err.message);
        }
    }

    // ─────────────── SAVE / LOAD ───────────────
    saveGame() {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify({
                v: 4,
                frames:            this.state.frames,
                totalFramesEarned: this.state.totalFramesEarned,
                totalClicks:       this.state.totalClicks,
                peakFPS:           this.state.peakFPS,
                upgrades:          this.state.upgrades.map(u => u.bought),
                oneTimeBought:     this.state.oneTimeBought,
            }));
        } catch (err) { log.warn('Save failed:', err.message); }
    }

    loadGame() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) { log.info('No save — fresh start'); return; }
            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') throw new GameError('BAD_SAVE', 'Not an object');
            const v = data.v ?? 1;
            if      (v >= 4) this._loadV4(data);
            else if (v === 3) this._loadV3(data);
            else if (v === 2) this._loadV2(data);
            else              this._loadV1(data);
            log.info(`Save v${v} loaded — frames: ${shortenNumber(this.state.frames)}, clicks: ${this.state.totalClicks}`);
        } catch (err) {
            log.error('Save corrupted, starting fresh:', err.message);
            this.state = defaultState();
        }
    }

    _loadV4(data) {
        const n = (k, fb = 0) => { const v = data[k]; return (typeof v === 'number' && isFinite(v)) ? v : fb; };
        this.state.frames            = n('frames');
        this.state.totalFramesEarned = n('totalFramesEarned', n('frames'));
        this.state.totalClicks       = n('totalClicks');
        this.state.peakFPS           = n('peakFPS');
        if (Array.isArray(data.upgrades))
            data.upgrades.forEach((b, i) => {
                if (this.state.upgrades[i] && typeof b === 'number' && b >= 0)
                    this.state.upgrades[i].bought = Math.floor(b);
            });
        if (Array.isArray(data.oneTimeBought))
            data.oneTimeBought.forEach((v, i) => {
                if (i < this.state.oneTimeBought.length) this.state.oneTimeBought[i] = !!v;
            });
    }

    _loadV3(data) {
        if (typeof data.frames === 'number' && isFinite(data.frames))
            this.state.frames = this.state.totalFramesEarned = data.frames;
        if (Array.isArray(data.upgrades))
            data.upgrades.forEach((b, i) => {
                if (this.state.upgrades[i] && typeof b === 'number' && b >= 0)
                    this.state.upgrades[i].bought = Math.floor(b);
            });
        if (Array.isArray(data.oneTimeBought))
            data.oneTimeBought.forEach((v, i) => {
                if (i < this.state.oneTimeBought.length) this.state.oneTimeBought[i] = !!v;
            });
        log.info('Migrated v3 → v4');
    }

    _loadV2(data) {
        if (typeof data.frames === 'number' && isFinite(data.frames))
            this.state.frames = this.state.totalFramesEarned = data.frames;
        if (Array.isArray(data.upgrades))
            data.upgrades.forEach((u, i) => {
                if (this.state.upgrades[i] && typeof u?.bought === 'number' && u.bought >= 0)
                    this.state.upgrades[i].bought = Math.floor(u.bought);
            });
        if (Array.isArray(data.oneTimeBought))
            data.oneTimeBought.forEach((v, i) => {
                if (i < this.state.oneTimeBought.length) this.state.oneTimeBought[i] = !!v;
            });
        log.info('Migrated v2 → v4');
    }

    _loadV1(data) {
        if (typeof data.frames === 'number' && isFinite(data.frames))
            this.state.frames = this.state.totalFramesEarned = data.frames;
        (data.upgrades?.bought || []).forEach((b, i) => {
            if (this.state.upgrades[i] && typeof b === 'number')
                this.state.upgrades[i].bought = Math.max(0, Math.floor(b));
        });
        (data.oneTimeUpgrades?.bought || []).forEach((v, i) => {
            if (i < this.state.oneTimeBought.length) this.state.oneTimeBought[i] = !!v;
        });
        log.info('Migrated v1 → v4');
    }
}

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => {
    const game = new NvidiaClicker();

    // ===== CONSOLE COMMANDS =====
    // Access via: NVC.<command>(args)
    window.NVC = Object.freeze({

        /** Print all available commands with descriptions. */
        help() {
            console.group('%c[NVC] Available commands', 'color:#76B900;font-weight:bold');
            const cmds = [
                ['NVC.help()',                        'Print this command list'],
                ['NVC.debug()',                       'Print all current game values'],
                ['NVC.setFrames(n)',                  'Set current frames to n'],
                ['NVC.addFrames(n)',                  'Add n frames (negative to subtract)'],
                ['NVC.setUpgrade(index, count)',      'Set bought count for a GPU upgrade (0-based index)'],
                ['NVC.buyAllUpgrades(count)',         'Buy count of every GPU upgrade'],
                ['NVC.unlockAllOneTime()',            'Mark all one-time upgrades as purchased'],
                ['NVC.setMultiplier(n)',              'Override passive+click multiplier (temporary, not saved)'],
                ['NVC.triggerMagicChip()',            'Force the magic chip to appear immediately'],
                ['NVC.setMagicInterval(seconds)',     'Change magic chip spawn interval (runtime only)'],
                ['NVC.resetSave()',                   'Wipe localStorage save and reload'],
                ['NVC.exportSave()',                  'Print save JSON to console'],
                ['NVC.importSave(json)',              'Load a save from a JSON string'],
            ];
            console.table(cmds.map(([cmd, desc]) => ({ command: cmd, description: desc })));
            console.groupEnd();
        },

        /** Print a full snapshot of all current game values. */
        debug() {
            const fps         = game.calcFPS();
            const passiveMult = game.calcPassiveMultiplier();
            const clickMult   = game.calcClickMultiplier();
            const buffActive  = game.activeBuff && Date.now() < game.activeBuff.expiresAt;

            console.group('%c[NVC] Debug snapshot', 'color:#76B900;font-weight:bold');

            console.group('Frames');
            console.log('current:        ', shortenNumber(game.state.frames), `(${game.state.frames})`);
            console.log('all-time earned:', shortenNumber(game.state.totalFramesEarned));
            console.log('total clicks:   ', game.state.totalClicks);
            console.log('peak FPS:       ', shortenNumber(game.state.peakFPS));
            console.groupEnd();

            console.group('Production');
            console.log('FPS (with mult):', shortenNumber(fps));
            console.log('raw FPS:        ', shortenNumber(game.upgMgr.totalRawFPS()));
            console.log('passive mult:   ', passiveMult.toFixed(6));
            console.log('click mult:     ', clickMult.toFixed(6));
            console.log('click value:    ', shortenNumber(game.calcClickValue()));
            console.groupEnd();

            console.group('Buffs');
            console.log('magic buff active:', buffActive);
            if (buffActive) console.log('buff expires in:', Math.ceil((game.activeBuff.expiresAt - Date.now()) / 1000) + 's');
            console.log('magic interval:   ', game.magicIntervalS() + 's');
            console.log('magic upgrade:    ', game.magicHasUpgrade());
            console.groupEnd();

            console.group('GPU Upgrades (index: name | bought | next cost)');
            UPGRADES.forEach((u, i) => {
                const bought = game.upgMgr.boughtOf(i);
                const next   = game.upgMgr.priceOf(i);
                console.log(`[${String(i).padStart(2, '0')}] ${u.name.padEnd(46)} bought: ${String(bought).padStart(4)}  next: ${shortenNumber(next)}`);
            });
            console.groupEnd();

            console.group('One-Time Upgrades (index: name | owned)');
            ONE_TIME_UPGRADES.forEach((u, i) => {
                const owned = game.state.oneTimeBought[i];
                const tag   = u.type === 'gpu' ? ` [GPU:${u.gpuIndex}]` : '';
                console.log(`[${String(i).padStart(3, '0')}] ${(u.name + tag).padEnd(36)} ${owned ? '✓ owned' : '✗ not owned'}`);
            });
            console.groupEnd();

            console.group('Settings');
            console.log(JSON.stringify(game.settings, null, 2));
            console.groupEnd();

            console.groupEnd();
        },

        /** Set current frame count to an exact value. */
        setFrames(n) {
            if (typeof n !== 'number' || !isFinite(n) || n < 0) {
                return log.error('setFrames: expected a non-negative number, got', n);
            }
            game.state.frames = n;
            game.updateDisplay();
            log.info(`setFrames → ${shortenNumber(n)}`);
        },

        /** Add (or subtract) frames from the current count. */
        addFrames(n) {
            if (typeof n !== 'number' || !isFinite(n)) {
                return log.error('addFrames: expected a number, got', n);
            }
            game.state.frames = Math.max(0, game.state.frames + n);
            game.updateDisplay();
            log.info(`addFrames(${shortenNumber(n)}) → total ${shortenNumber(game.state.frames)}`);
        },

        /** Set how many of a GPU upgrade (0-based index) are owned. */
        setUpgrade(index, count) {
            if (!Number.isInteger(index) || index < 0 || index >= UPGRADES.length) {
                return log.error(`setUpgrade: index must be 0–${UPGRADES.length - 1}, got`, index);
            }
            if (!Number.isInteger(count) || count < 0) {
                return log.error('setUpgrade: count must be a non-negative integer, got', count);
            }
            game.state.upgrades[index].bought = count;
            // Reveal all unlocked tiers
            for (let i = 1; i < UPGRADES.length; i++) {
                const el = document.getElementById(`upgItem_${i}`);
                if (el) el.style.display = game.state.upgrades[i - 1].bought > 0 ? 'flex' : el.style.display;
            }
            game.updateDisplay();
            log.info(`setUpgrade(${index} "${UPGRADES[index].name}", ${count})`);
        },

        /** Set every GPU upgrade to count (default 10). */
        buyAllUpgrades(count = 10) {
            if (!Number.isInteger(count) || count < 0) {
                return log.error('buyAllUpgrades: count must be a non-negative integer, got', count);
            }
            UPGRADES.forEach((_, i) => { game.state.upgrades[i].bought = count; });
            // Reveal all upgrade rows
            UPGRADES.forEach((_, i) => {
                const el = document.getElementById(`upgItem_${i}`);
                if (el) el.style.display = 'flex';
            });
            game.updateDisplay();
            log.info(`buyAllUpgrades: set every GPU to x${count}`);
        },

        /** Mark all one-time upgrades as purchased and hide their buttons. */
        unlockAllOneTime() {
            ONE_TIME_UPGRADES.forEach((_, i) => {
                game.state.oneTimeBought[i] = true;
                const el = document.getElementById(`otItem_${i}`);
                if (el) el.style.display = 'none';
            });
            game.updateDisplay();
            log.info('unlockAllOneTime: all one-time upgrades marked as owned');
        },

        /** Temporarily override the effective multiplier by injecting a fake buff.
         *  Pass 1 to clear the override. Not saved to disk. */
        setMultiplier(n) {
            if (typeof n !== 'number' || !isFinite(n) || n <= 0) {
                return log.error('setMultiplier: expected a positive number, got', n);
            }
            if (n === 1) {
                game.activeBuff = null;
                log.info('setMultiplier: buff cleared');
            } else {
                // Abuse the buff system: inject a very long-lived buff scaled to
                // the ratio between desired total multiplier and the base multiplier.
                const base  = game.calcPassiveMultiplier();
                const ratio = n / base;
                // Store ratio as a pseudo-buff — calcPassiveMultiplier multiplies by MAGIC.BUFF_MULTIPLIER,
                // so we back-solve: set MAGIC.BUFF_MULTIPLIER dynamically for this session.
                MAGIC.BUFF_MULTIPLIER = ratio;
                game.activeBuff = { expiresAt: Date.now() + 1e10 }; // ~115 days
                game.updateDisplay();
                log.info(`setMultiplier(${n}): effective passive mult ≈ ${game.calcPassiveMultiplier().toFixed(4)}`);
            }
        },

        /** Force the magic chip to appear right now, bypassing the scheduler. */
        triggerMagicChip() {
            clearTimeout(game.magicSpawnTimer);
            game._showMagicChip();
            log.info('triggerMagicChip: forced spawn');
        },

        /** Change the magic chip spawn interval for this session (seconds). */
        setMagicInterval(seconds) {
            if (typeof seconds !== 'number' || !isFinite(seconds) || seconds < 1) {
                return log.error('setMagicInterval: expected a positive number of seconds, got', seconds);
            }
            MAGIC.DEFAULT_INTERVAL_S  = seconds;
            MAGIC.UPGRADED_INTERVAL_S = seconds / 2;
            clearTimeout(game.magicSpawnTimer);
            game._scheduleMagicChip();
            log.info(`setMagicInterval: base=${seconds}s, upgraded=${seconds / 2}s — rescheduled`);
        },

        /** Wipe the save from localStorage and reload the page. */
        resetSave() {
            localStorage.removeItem(SAVE_KEY);
            log.info('resetSave: save wiped, reloading...');
            setTimeout(() => location.reload(), 300);
        },

        /** Print the current save as a formatted JSON string. */
        exportSave() {
            game.saveGame(); // flush latest state first
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) { log.warn('exportSave: no save found in localStorage'); return; }
            console.group('%c[NVC] exportSave', 'color:#76B900;font-weight:bold');
            console.log(JSON.stringify(JSON.parse(raw), null, 2));
            console.groupEnd();
            log.info('exportSave: copy the JSON above and pass it to NVC.importSave(json)');
        },

        /** Load game state from a JSON string (as produced by NVC.exportSave()). */
        importSave(json) {
            if (typeof json !== 'string' || !json.trim()) {
                return log.error('importSave: expected a non-empty JSON string');
            }
            try {
                JSON.parse(json); // validate before writing
            } catch (e) {
                return log.error('importSave: invalid JSON —', e.message);
            }
            localStorage.setItem(SAVE_KEY, json);
            log.info('importSave: save written, reloading...');
            setTimeout(() => location.reload(), 300);
        },
    });

    // Print hint on load
    console.log('%c[NVC]%c Type %cNVC.help()%c for a list of console commands.',
        'color:#76B900;font-weight:bold', 'color:inherit',
        'color:#76B900;font-weight:bold', 'color:inherit');
});
