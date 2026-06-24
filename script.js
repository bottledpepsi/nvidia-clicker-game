'use strict';

/* =========================================================================
   GPU CLICKER — core script
   A from-scratch rewrite. Architecture inspired by Cookie Clicker's
   buildings/upgrades/shimmer model (flat 1.15x cost growth, "owns >= N"
   upgrade unlocks, a shimmer pool with several effect types, and a light
   achievement layer) reimagined with an NVIDIA GPU/frame-rate theme.
   ========================================================================= */

// ===== LOGGER =====
const log = (() => {
    const PREFIX = '%c[GPC]%c';
    const BASE   = 'color:#76B900;font-weight:bold';
    const RESET  = 'color:inherit;font-weight:normal';
    return {
        info:  (msg, ...a) => console.log  (`${PREFIX} ${msg}`, BASE, RESET, ...a),
        warn:  (msg, ...a) => console.warn (`${PREFIX} ${msg}`, BASE, RESET, ...a),
        error: (msg, ...a) => console.error(`${PREFIX} ${msg}`, BASE, RESET, ...a),
    };
})();

// =========================================================================
// BUILDINGS — 15 GPU tiers. Flat 1.15x cost growth per unit owned
// (Cookie-Clicker style), instead of a sliding per-tier scale curve.
// fpsPerSec is the BASE output of a single unit before any multipliers.
// =========================================================================
const BUILDINGS = [
    { id: 'gpu0',  name: 'GeForce 256',            glyph: '🟩', baseCost: 15,        baseFps: 0.1            },
    { id: 'gpu1',  name: 'GeForce 2 MX',           glyph: '🟩', baseCost: 100,       baseFps: 1              },
    { id: 'gpu2',  name: 'GeForce FX 5200',        glyph: '🟢', baseCost: 1_100,     baseFps: 8              },
    { id: 'gpu3',  name: 'GeForce 7800 GTX',       glyph: '🟢', baseCost: 12_000,    baseFps: 47             },
    { id: 'gpu4',  name: 'GeForce 8800 GTS',       glyph: '💚', baseCost: 130_000,   baseFps: 260            },
    { id: 'gpu5',  name: 'GeForce GTX 670',        glyph: '💚', baseCost: 1_400_000, baseFps: 1_400          },
    { id: 'gpu6',  name: 'GeForce GTX 1080 Ti',    glyph: '✨', baseCost: 20_000_000,        baseFps: 7_800          },
    { id: 'gpu7',  name: 'GeForce RTX 2080 Ti',    glyph: '✨', baseCost: 330_000_000,       baseFps: 44_000         },
    { id: 'gpu8',  name: 'GeForce RTX 3090',       glyph: '🔷', baseCost: 5_100_000_000,     baseFps: 260_000        },
    { id: 'gpu9',  name: 'GeForce RTX 4090',       glyph: '🔷', baseCost: 75_000_000_000,    baseFps: 1_600_000      },
    { id: 'gpu10', name: 'GeForce RTX 5090',       glyph: '🔶', baseCost: 1_100_000_000_000, baseFps: 10_000_000     },
    { id: 'gpu11', name: 'RTX "Blackwell Ultra"',  glyph: '🔶', baseCost: 1.6e13,  baseFps: 64_000_000     },
    { id: 'gpu12', name: 'RTX "Rubin" Datacenter', glyph: '⚡', baseCost: 2.3e14,  baseFps: 420_000_000    },
    { id: 'gpu13', name: 'Quantum Tensor Core',    glyph: '🌌', baseCost: 3.4e15,  baseFps: 2.8e9          },
    { id: 'gpu14', name: 'Dyson Sphere Render Farm', glyph: '☀️', baseCost: 5e16,  baseFps: 1.9e10         },
];
const COST_GROWTH = 1.15; // flat per-unit growth, matches Cookie Clicker's Game.priceIncrease

function buildingCost(building, owned) {
    return Math.ceil(building.baseCost * Math.pow(COST_GROWTH, owned));
}
// Cost to buy `count` units starting from `owned` already owned (bulk-buy sum)
function buildingBulkCost(building, owned, count) {
    let total = 0;
    for (let i = 0; i < count; i++) total += buildingCost(building, owned + i);
    return total;
}
// How many units can be bought right now with `frames`, starting from `owned`
function maxAffordable(building, owned, frames) {
    let n = 0, spent = 0;
    while (true) {
        const c = buildingCost(building, owned + n);
        if (spent + c > frames) break;
        spent += c; n++;
        if (n > 10000) break; // safety
    }
    return n;
}

// =========================================================================
// BUILDING UPGRADES — "own >= N of building X" milestone upgrades.
// Mirrors Cookie Clicker's per-building upgrade chain. Each tier doubles
// (or triples, late game) that building's own output.
// =========================================================================
const BUILDING_MILESTONES = [
    { threshold: 1,   mult: 2, label: n => `${n} Mk.II` },
    { threshold: 25,  mult: 2, label: n => `${n} Mk.III` },
    { threshold: 50,  mult: 2, label: n => `${n} Mk.IV` },
    { threshold: 100, mult: 3, label: n => `${n} Mk.V` },
    { threshold: 200, mult: 3, label: n => `${n} Mk.VI` },
];

function buildBuildingUpgrades() {
    const out = [];
    BUILDINGS.forEach((b, bi) => {
        BUILDING_MILESTONES.forEach((m, mi) => {
            out.push({
                key: `bu_${bi}_${mi}`,
                kind: 'building',
                buildingIndex: bi,
                threshold: m.threshold,
                multiplier: m.mult,
                name: m.label(b.name),
                desc: `Doubles${m.mult !== 2 ? `/triples` : ''} ${b.name} output. x${m.mult} all ${b.name} frame generation.`,
                cost: Math.ceil(buildingCost(b, 0) * (m.threshold * 9 + 30) * Math.pow(2.1, mi)),
                glyph: b.glyph,
            });
        });
    });
    return out;
}

// =========================================================================
// CLICK UPGRADES — scale click value, gated by lifetime frames + clicks.
// =========================================================================
const CLICK_UPGRADES = [
    { key: 'click0', name: 'Gaming Mouse',          mult: 2,  cost: 1_500,        lifetimeReq: 0,        desc: 'Doubles frames per click.' },
    { key: 'click1', name: 'Mechanical Keyboard',   mult: 2,  cost: 30_000,       lifetimeReq: 10_000,   desc: 'Doubles frames per click.' },
    { key: 'click2', name: 'Neural Click Interface',mult: 3,  cost: 6_000_000,    lifetimeReq: 2_000_000,desc: 'x3 frames per click.' },
    { key: 'click3', name: 'Turbo Neural Click',    mult: 3,  cost: 800_000_000,  lifetimeReq: 3e8,      desc: 'x3 frames per click.' },
    { key: 'click4', name: 'Omega Click Transcendence', mult: 4, cost: 4e11,      lifetimeReq: 2e11,     desc: 'x4 frames per click.' },
    { key: 'click5', name: 'Singularity Cursor',    mult: 5,  cost: 9e14,         lifetimeReq: 5e14,     desc: 'x5 frames per click.' },
    { key: 'click6', name: 'Click Production Synergy', mult: 0, cost: 5e9,       lifetimeReq: 1e9,
        desc: 'Click value also gains +1% per building owned.', special: 'clickPerBuilding' },
];

// =========================================================================
// GLOBAL UPGRADES — flat global production multipliers, gated by lifetime
// frames thresholds. Replaces the old hand-written 24-item list with a
// cleaner table; still has thematic names.
// =========================================================================
const GLOBAL_UPGRADES = [
    { key: 'g0', name: 'Thermal Paste',          mult: 1.25, cost: 500,            lifetimeReq: 0,       desc: '+25% all frame generation.' },
    { key: 'g1', name: 'SLI Bridge',             mult: 1.5,  cost: 7_500,          lifetimeReq: 1_000,   desc: '+50% all frame generation.' },
    { key: 'g2', name: 'GPU Cluster Rack',       mult: 2,    cost: 100_000,        lifetimeReq: 20_000,  desc: 'x2 all frame generation.' },
    { key: 'g3', name: 'Liquid Nitrogen Cooling',mult: 2,    cost: 5_000_000,      lifetimeReq: 1_000_000, desc: 'x2 all frame generation.' },
    { key: 'g4', name: 'Quantum Cooling Loop',   mult: 2.5,  cost: 250_000_000,    lifetimeReq: 5e7,     desc: 'x2.5 all frame generation.' },
    { key: 'g5', name: 'Phase-Change Unit',      mult: 2,    cost: 2.5e10,         lifetimeReq: 5e9,     desc: 'x2 all frame generation.' },
    { key: 'g6', name: 'Superconductor Array',   mult: 2,    cost: 7e12,           lifetimeReq: 1.5e12,  desc: 'x2 all frame generation.' },
    { key: 'g7', name: 'Dimensional Shader Core',mult: 3,    cost: 3e14,           lifetimeReq: 6e13,    desc: 'x3 all frame generation.' },
    { key: 'g8', name: 'Dark Matter Heatsink',   mult: 3,    cost: 1.5e17,         lifetimeReq: 3e16,    desc: 'x3 all frame generation.' },
    { key: 'g9', name: 'Quantum Entanglement Mesh', mult: 4, cost: 2e19,           lifetimeReq: 4e18,    desc: 'x4 all frame generation.' },
    { key: 'g10', name: 'Singularity Core',      mult: 5,    cost: 8e21,           lifetimeReq: 1.6e21,  desc: 'x5 all frame generation.' },
    { key: 'g11', name: 'Photon Nexus Engine',   mult: 6,    cost: 5e24,           lifetimeReq: 1e24,    desc: 'x6 all frame generation.' },
    { key: 'g12', name: 'Sugar-free Overclock',  mult: 1.01, cost: 1e9,            lifetimeReq: 0,
        desc: '+1% global production per Driver Point owned.', special: 'perDriverPoint' },
];

// =========================================================================
// GOLDEN CHIP — shimmer system with several effect types, inspired by
// Cookie Clicker's Game.shimmer pool (instead of one fixed x5 buff).
// =========================================================================
const CHIP_EFFECTS = [
    { id: 'frenzy',      weight: 45, label: 'FRAME FRENZY', mult: 7,  durationS: 30, kind: 'production' },
    { id: 'clickFrenzy', weight: 20, label: 'CLICK FRENZY', mult: 15, durationS: 15, kind: 'click' },
    { id: 'lucky',       weight: 30, label: 'LUCKY CHIP',   kind: 'instant' }, // instant frames, computed on collect
    { id: 'overclock',   weight: 5,  label: 'OVERCLOCK',    mult: 3,  durationS: 60, kind: 'production' },
];
const CHIP_CONFIG = {
    BASE_INTERVAL_S: 90,
    MIN_INTERVAL_S:  40,
    JITTER:          0.5,     // ± up to 50% of the interval
    VISIBLE_S:       13,
    LUCKY_FRACTION:  0.15,    // lucky chip = max(15% of current frames, 20s of production)
    LUCKY_SECONDS:   20,
};
// Upgrades that improve the chip system. 'rate' halves spawn interval (stacking),
// 'magnitude' increases effect duration/multiplier.
const CHIP_UPGRADES = [
    { key: 'chip0', name: 'Quantum Luck Module', cost: 500_000_000,  lifetimeReq: 1e8, effect: 'rate',      desc: 'Halves the time between Golden Chip spawns.' },
    { key: 'chip1', name: 'Lucky Silicon',       cost: 4e13,         lifetimeReq: 8e12, effect: 'magnitude', desc: 'Golden Chip effects last 50% longer and hit 50% harder.' },
    { key: 'chip2', name: 'Probability Render Core', cost: 2e18,     lifetimeReq: 4e17, effect: 'rate',      desc: 'Halves the time between Golden Chip spawns again.' },
];

const SAVE_KEY     = 'gpuClickerSave';
const SETTINGS_KEY = 'gpuClickerSettings';
const SAVE_INTERVAL_MS = 5000;
const SAVE_VERSION = 1;

// =========================================================================
// PRESTIGE — "Driver Update". Soft reset converting lifetime frames into
// permanent Driver Points (+1% global production each). New mechanic not
// present in the original game; gives endgame players a reset loop.
// =========================================================================
const PRESTIGE = {
    DIVISOR: 1e12, // lifetimeFrames / DIVISOR, cube-rooted, floored
};
function driverPointsFor(lifetimeFrames) {
    return Math.floor(Math.cbrt(Math.max(0, lifetimeFrames) / PRESTIGE.DIVISOR));
}
function driverPointMultiplier(points) {
    return 1 + points * 0.01;
}

// =========================================================================
// ACHIEVEMENTS — cosmetic milestone badges, light touch, no mechanical
// effect (mirrors Cookie Clicker's badge wall).
// =========================================================================
function buildAchievements() {
    const list = [];
    const lifetimeMilestones = [
        1_000, 100_000, 10_000_000, 1_000_000_000, 1e12, 1e15, 1e18, 1e21, 1e24,
    ];
    lifetimeMilestones.forEach((m, i) => list.push({
        key: `ach_life_${i}`, name: `${shortenNumber(m)} Frames`,
        desc: `Earn ${shortenNumber(m)} lifetime frames.`,
        check: (s) => s.lifetimeFrames >= m,
    }));
    const clickMilestones = [100, 1_000, 10_000, 100_000];
    clickMilestones.forEach((m, i) => list.push({
        key: `ach_click_${i}`, name: `${m.toLocaleString()} Clicks`,
        desc: `Click the GPU ${m.toLocaleString()} times.`,
        check: (s) => s.totalClicks >= m,
    }));
    const buildingMilestones = [10, 50, 150, 400, 1000];
    buildingMilestones.forEach((m, i) => list.push({
        key: `ach_owned_${i}`, name: `${m} GPUs Owned`,
        desc: `Own ${m} GPUs in total.`,
        check: (s) => totalOwned(s) >= m,
    }));
    list.push({
        key: 'ach_chip0', name: 'Lucky Find',
        desc: 'Collect your first Golden Chip.',
        check: (s) => s.chipsCollected >= 1,
    });
    list.push({
        key: 'ach_chip1', name: 'Chip Connoisseur',
        desc: 'Collect 25 Golden Chips.',
        check: (s) => s.chipsCollected >= 25,
    });
    [1, 5, 15].forEach((m, i) => list.push({
        key: `ach_prestige_${i}`, name: `Driver Update x${m}`,
        desc: `Perform a Driver Update ${m} time(s).`,
        check: (s) => s.prestigeCount >= m,
    }));
    return list;
}
function totalOwned(state) {
    return state.buildings.reduce((s, b) => s + b.owned, 0);
}

// =========================================================================
// NUMBER FORMATTING
// =========================================================================
const SUFFIXES = [
    '', 'k', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No',
    'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc',
    'Vg', 'UVg', 'DVg', 'TVg', 'QaVg',
];

function shortenNumber(num) {
    if (!isFinite(num) || isNaN(num) || num < 0) return '0';
    if (num < 1000) return num < 10 && num !== 0 ? num.toFixed(2) : (num % 1 === 0 ? num.toFixed(0) : num.toFixed(1));
    let idx = 0;
    while (num >= 1000 && idx < SUFFIXES.length - 1) { num /= 1000; idx++; }
    return (num < 10 ? num.toFixed(2) : num < 100 ? num.toFixed(1) : num.toFixed(0)) + SUFFIXES[idx];
}

function formatTime(totalSecs) {
    const s = Math.floor(totalSecs);
    if (s < 60)   return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

// =========================================================================
// DEFAULT STATE / SETTINGS
// =========================================================================
function defaultSettings() {
    return {
        particles: true,
        titleFPS:  false,
        showStats: false,
        reducedMotion: false,
    };
}

function defaultState() {
    return {
        frames:          0,
        lifetimeFrames:  0,
        totalClicks:     0,
        peakFPS:         0,
        chipsCollected:  0,
        prestigeCount:   0,
        driverPoints:    0,
        buildings:       BUILDINGS.map(() => ({ owned: 0 })),
        buildingUpgrades: {},   // key -> true
        clickUpgrades:    {},   // key -> true
        globalUpgrades:   {},   // key -> true
        chipUpgrades:     {},   // key -> true
        achievements:     {},   // key -> true
        sessionStart:     Date.now(),
    };
}

class GameError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'GameError';
        this.code = code;
    }
}

// =========================================================================
// MAIN GAME ENGINE
// =========================================================================
class GpuClicker {
    constructor() {
        this.state    = defaultState();
        this.settings = defaultSettings();

        this.buildingUpgrades = buildBuildingUpgrades();
        this.achievementsList = buildAchievements();

        this.lastTickTime = performance.now();
        this.toastTimer    = null;
        this.achToastTimer = null;

        // Chip (shimmer) runtime state — never persisted
        this.chipSpawnTimer = null;
        this.chipHideTimer  = null;
        this.chipVisible    = false;
        this.activeBuff     = null; // { kind:'production'|'click', mult, expiresAt, label }

        this.loadSettings();
        this.loadGame();

        this.buildUI();
        this.bindEvents();
        this.applySettings();
        this.updateDisplay(true);

        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);

        setInterval(() => this.saveGame(), SAVE_INTERVAL_MS);
        this._scheduleChip();

        log.info(`Init — frames: ${shortenNumber(this.state.frames)}, FPS: ${shortenNumber(this.calcFPS())}, driver points: ${this.state.driverPoints}`);
    }

    // ───────────────────────────── GAME LOOP ─────────────────────────────
    _loop(now) {
        const delta = Math.min(1, (now - this.lastTickTime) / 1000); // clamp to avoid huge jumps on tab refocus
        this.lastTickTime = now;

        const fps = this.calcFPS();
        if (fps > 0 && delta > 0) {
            const earned = fps * delta;
            this.state.frames         += earned;
            this.state.lifetimeFrames += earned;
            if (fps > this.state.peakFPS) this.state.peakFPS = fps;
        }
        this.updateDisplay();
        this._checkAchievements();

        requestAnimationFrame(this._loop);
    }

    // ───────────────────────────── MULTIPLIERS ─────────────────────────────
    /** Per-building multiplier from owned building-upgrades. */
    buildingMultiplier(bi) {
        let m = 1;
        this.buildingUpgrades.forEach(u => {
            if (u.buildingIndex === bi && this.state.buildingUpgrades[u.key]) m *= u.multiplier;
        });
        return m;
    }

    rawFps() {
        return BUILDINGS.reduce((sum, b, i) => {
            const owned = this.state.buildings[i].owned;
            if (owned <= 0) return sum;
            return sum + owned * b.baseFps * this.buildingMultiplier(i);
        }, 0);
    }

    globalMultiplier() {
        let m = 1;
        GLOBAL_UPGRADES.forEach(u => {
            if (!this.state.globalUpgrades[u.key]) return;
            if (u.special === 'perDriverPoint') m *= 1 + this.state.driverPoints * 0.01;
            else m *= u.mult;
        });
        m *= driverPointMultiplier(this.state.driverPoints);
        if (this.activeBuff && this.activeBuff.kind === 'production' && Date.now() < this.activeBuff.expiresAt) {
            m *= this.activeBuff.mult;
        }
        return m;
    }

    clickMultiplier() {
        let m = 1;
        CLICK_UPGRADES.forEach(u => {
            if (!this.state.clickUpgrades[u.key]) return;
            if (u.special === 'clickPerBuilding') m *= 1 + totalOwned(this.state) * 0.01;
            else m *= u.mult;
        });
        // click value also benefits from global multiplier (feels consistent w/ passive)
        m *= this.globalMultiplier();
        if (this.activeBuff && this.activeBuff.kind === 'click' && Date.now() < this.activeBuff.expiresAt) {
            m *= this.activeBuff.mult;
        }
        return m;
    }

    calcFPS()        { return this.rawFps() * this.globalMultiplier(); }
    calcClickValue() { return Math.max(1, this.clickMultiplier()); }

    // ───────────────────────────── CHIP HELPERS ─────────────────────────────
    chipRateLevel()      { return CHIP_UPGRADES.filter(u => u.effect === 'rate' && this.state.chipUpgrades[u.key]).length; }
    chipMagnitudeLevel() { return CHIP_UPGRADES.filter(u => u.effect === 'magnitude' && this.state.chipUpgrades[u.key]).length; }
    chipIntervalS() {
        const base = Math.max(CHIP_CONFIG.MIN_INTERVAL_S, CHIP_CONFIG.BASE_INTERVAL_S / Math.pow(2, this.chipRateLevel()));
        return base;
    }
}

// ───────────────────────────── UI BUILD ─────────────────────────────
GpuClicker.prototype.buildUI = function () {
    this._buildBuildings();
    this._buildShop();
};

GpuClicker.prototype._buildBuildings = function () {
    const container = document.getElementById('buildingsContainer');
    if (!container) return;
    BUILDINGS.forEach((b, i) => {
        const row = document.createElement('div');
        row.className = 'building-row';
        row.id = `bld_${i}`;
        row.innerHTML = `
            <button class="building-btn" id="bldBtn_${i}" aria-label="${b.name}">
                <span class="bld-glyph">${b.glyph}</span>
                <span class="bld-info">
                    <span class="bld-name">${b.name}</span>
                    <span class="bld-fps" id="bldFps_${i}">+0/s each</span>
                </span>
                <span class="bld-owned" id="bldOwned_${i}">0</span>
            </button>
            <span class="bld-price" id="bldPrice_${i}">–</span>
        `;
        container.appendChild(row);
    });
};

GpuClicker.prototype._buildShop = function () {
    const clickC  = document.getElementById('clickUpgradesContainer');
    const globalC = document.getElementById('globalUpgradesContainer');
    const chipC   = document.getElementById('chipUpgradesContainer');
    const bldC    = document.getElementById('buildingUpgradesContainer');

    const makeCard = (containerId, key, name, desc, badgeText, badgeClass) => {
        const el = document.createElement('div');
        el.className = 'upgrade-card';
        el.id = `card_${key}`;
        el.hidden = true;
        el.innerHTML = `
            <button class="upgrade-btn" id="btn_${key}" aria-label="${name}: ${desc}">
                <span class="upg-top">
                    <span class="upg-name">${name}</span>
                    <span class="upg-badge ${badgeClass}">${badgeText}</span>
                </span>
                <span class="upg-desc">${desc}</span>
                <span class="upg-price" id="price_${key}">–</span>
            </button>
        `;
        return el;
    };

    CLICK_UPGRADES.forEach(u => {
        clickC.appendChild(makeCard('clickUpgradesContainer', u.key, u.name, u.desc, 'CLICK', 'badge-click'));
    });
    GLOBAL_UPGRADES.forEach(u => {
        globalC.appendChild(makeCard('globalUpgradesContainer', u.key, u.name, u.desc, 'GLOBAL', 'badge-global'));
    });
    CHIP_UPGRADES.forEach(u => {
        chipC.appendChild(makeCard('chipUpgradesContainer', u.key, u.name, u.desc, 'CHIP', 'badge-chip'));
    });
    this.buildingUpgrades.forEach(u => {
        bldC.appendChild(makeCard('buildingUpgradesContainer', u.key, `${u.glyph} ${u.name}`, u.desc, 'GPU', 'badge-gpu'));
    });
};

// ───────────────────────────── EVENTS ─────────────────────────────
GpuClicker.prototype.bindEvents = function () {
    const clicker = document.getElementById('clicker');
    clicker.addEventListener('click', e => this._handleClick(e));
    clicker.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._handleClick(e); }
    });

    const chip = document.getElementById('goldenChip');
    if (chip) {
        chip.addEventListener('click', e => { e.stopPropagation(); this._collectChip(); });
        chip.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._collectChip(); }
        });
    }

    document.getElementById('buildingsContainer').addEventListener('click', e => {
        const btn = e.target.closest('.building-btn');
        if (!btn) return;
        const i = parseInt(btn.id.replace('bldBtn_', ''), 10);
        this.purchaseBuilding(i);
    });

    ['clickUpgradesContainer', 'globalUpgradesContainer', 'chipUpgradesContainer', 'buildingUpgradesContainer']
        .forEach(id => {
            document.getElementById(id).addEventListener('click', e => {
                const btn = e.target.closest('.upgrade-btn');
                if (!btn) return;
                const key = btn.id.replace('btn_', '');
                this.purchaseShopItem(key);
            });
        });

    // Buy quantity toggle (1 / 10 / max)
    document.querySelectorAll('.buy-qty-btn').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.buy-qty-btn').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            this.buyQty = b.dataset.qty === 'max' ? 'max' : parseInt(b.dataset.qty, 10);
            this.updateDisplay(true);
        });
    });
    this.buyQty = 1;

    // Tabs
    document.querySelectorAll('.shop-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.shop-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${tab.dataset.panel}`).classList.add('active');
        });
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
        if (confirm('Reset your ENTIRE save? This cannot be undone!')) {
            localStorage.removeItem(SAVE_KEY);
            location.reload();
        }
    });

    document.getElementById('openSettings').addEventListener('click', e => {
        e.stopPropagation();
        menuItems.classList.remove('open');
        this._openModal('settingsModal');
    });
    document.getElementById('closeSettings').addEventListener('click', () => this._closeModal('settingsModal'));

    document.getElementById('openAchievements').addEventListener('click', e => {
        e.stopPropagation();
        menuItems.classList.remove('open');
        this._renderAchievements();
        this._openModal('achievementsModal');
    });
    document.getElementById('closeAchievements').addEventListener('click', () => this._closeModal('achievementsModal'));

    document.getElementById('openPrestige').addEventListener('click', e => {
        e.stopPropagation();
        menuItems.classList.remove('open');
        this._renderPrestige();
        this._openModal('prestigeModal');
    });
    document.getElementById('closePrestige').addEventListener('click', () => this._closeModal('prestigeModal'));
    document.getElementById('confirmPrestige').addEventListener('click', () => this._doPrestige());

    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.addEventListener('click', e => { if (e.target === e.currentTarget) this._closeModal(m.id); });
    });

    document.getElementById('set-particles').addEventListener('change', e => {
        this.settings.particles = e.target.checked; this.saveSettings();
    });
    document.getElementById('set-titleFPS').addEventListener('change', e => {
        this.settings.titleFPS = e.target.checked; this.saveSettings();
    });
    document.getElementById('set-showStats').addEventListener('change', e => {
        this.settings.showStats = e.target.checked; this._applyStatsVisibility(); this.saveSettings();
    });
    document.getElementById('set-reducedMotion').addEventListener('change', e => {
        this.settings.reducedMotion = e.target.checked;
        document.body.classList.toggle('reduced-motion', this.settings.reducedMotion);
        this.saveSettings();
    });
};

GpuClicker.prototype._openModal = function (id) {
    const m = document.getElementById(id);
    m.removeAttribute('hidden');
    requestAnimationFrame(() => m.classList.add('open'));
};
GpuClicker.prototype._closeModal = function (id) {
    const m = document.getElementById(id);
    m.classList.remove('open');
    setTimeout(() => m.setAttribute('hidden', ''), 180);
};

GpuClicker.prototype.applySettings = function () {
    document.getElementById('set-particles').checked = this.settings.particles;
    document.getElementById('set-titleFPS').checked  = this.settings.titleFPS;
    document.getElementById('set-showStats').checked = this.settings.showStats;
    document.getElementById('set-reducedMotion').checked = this.settings.reducedMotion;
    document.body.classList.toggle('reduced-motion', this.settings.reducedMotion);
    this._applyStatsVisibility();
};

GpuClicker.prototype._applyStatsVisibility = function () {
    const panel = document.getElementById('statsPanel');
    if (panel) panel.classList.toggle('stats-visible', !!this.settings.showStats);
};

// ───────────────────────────── CLICK HANDLER ─────────────────────────────
GpuClicker.prototype._handleClick = function (e) {
    const val = this.calcClickValue();
    this.state.frames         += val;
    this.state.lifetimeFrames += val;
    this.state.totalClicks++;
    if (this.settings.particles) this._spawnParticle(val, e);
    this.updateDisplay();
};

GpuClicker.prototype._spawnParticle = function (val, e, cssClass) {
    if (this.settings.reducedMotion) return;
    const p = document.createElement('div');
    p.className = 'particle' + (cssClass ? ' ' + cssClass : '');
    p.textContent = '+' + shortenNumber(val);

    let x, y;
    if (e?.clientX != null) {
        x = e.clientX + (Math.random() - 0.5) * 40;
        y = e.clientY + (Math.random() - 0.5) * 20;
    } else {
        const rect = document.getElementById('clicker').getBoundingClientRect();
        x = rect.left + rect.width / 2;
        y = rect.top + rect.height / 2;
    }
    p.style.left = x + 'px';
    p.style.top  = y + 'px';
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1400);
};

GpuClicker.prototype._particleFromEl = function (elId, val, cssClass) {
    const el = document.getElementById(elId);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    this._spawnParticle(val, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, cssClass);
};

// ───────────────────────────── GOLDEN CHIP (shimmer) ─────────────────────────────
GpuClicker.prototype._scheduleChip = function () {
    clearTimeout(this.chipSpawnTimer);
    const base   = this.chipIntervalS() * 1000;
    const jitter = (Math.random() - 0.5) * 2 * base * CHIP_CONFIG.JITTER;
    const delay  = Math.max(10_000, base + jitter);
    this.chipSpawnTimer = setTimeout(() => this._showChip(), delay);
};

GpuClicker.prototype._pickChipEffect = function () {
    const totalWeight = CHIP_EFFECTS.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * totalWeight;
    for (const c of CHIP_EFFECTS) {
        if (r < c.weight) return c;
        r -= c.weight;
    }
    return CHIP_EFFECTS[0];
};

GpuClicker.prototype._showChip = function () {
    if (this.chipVisible) return;
    this.chipVisible = true;
    this.pendingChipEffect = this._pickChipEffect();

    const el   = document.getElementById('goldenChip');
    const zone = document.getElementById('chipSpawnZone');
    if (!el || !zone) return;

    const CHIP_SIZE = 70;
    const zW = zone.offsetWidth  || 300;
    const zH = zone.offsetHeight || 160;
    el.style.left = Math.max(0, Math.random() * (zW - CHIP_SIZE)) + 'px';
    el.style.top  = Math.max(0, Math.random() * (zH - CHIP_SIZE)) + 'px';
    el.classList.toggle('chip-rare', this.pendingChipEffect.id === 'overclock');
    el.removeAttribute('hidden');

    this.chipHideTimer = setTimeout(() => this._hideChip(false), CHIP_CONFIG.VISIBLE_S * 1000);
};

GpuClicker.prototype._hideChip = function (collected) {
    clearTimeout(this.chipHideTimer);
    const el = document.getElementById('goldenChip');
    if (el) el.setAttribute('hidden', '');
    this.chipVisible = false;
    this._scheduleChip();
};

GpuClicker.prototype._collectChip = function () {
    if (!this.chipVisible) return;
    const effect = this.pendingChipEffect;
    const magLevel = this.chipMagnitudeLevel();
    const magBonus = Math.pow(1.5, magLevel);

    this.state.chipsCollected++;

    if (effect.kind === 'instant') {
        const fps = this.calcFPS();
        const gained = Math.max(
            fps * CHIP_CONFIG.LUCKY_SECONDS,
            this.state.frames * CHIP_CONFIG.LUCKY_FRACTION
        ) * magBonus;
        this.state.frames         += gained;
        this.state.lifetimeFrames += gained;
        this._showToast(`LUCKY CHIP! +${shortenNumber(gained)} frames`, 'chip');
        this._particleFromEl('goldenChip', gained, 'particle-magic');
    } else {
        const mult = 1 + (effect.mult - 1) * magBonus;
        const duration = effect.durationS * magBonus;
        this.activeBuff = { kind: effect.kind, mult, expiresAt: Date.now() + duration * 1000, label: effect.label };
        this._showToast(`${effect.label}! x${mult.toFixed(1)} for ${Math.round(duration)}s`, 'magic');
        this._particleFromEl('goldenChip', 0, 'particle-magic');
        this._startBuffIndicator();
    }

    this._hideChip(true);
    this.updateDisplay();
};

GpuClicker.prototype._startBuffIndicator = function () {
    const bar   = document.getElementById('buffBar');
    const label = document.getElementById('buffLabel');
    const fill  = document.getElementById('buffFill');
    if (!bar) return;
    bar.removeAttribute('hidden');

    const totalDuration = (this.activeBuff.expiresAt - Date.now()) / 1000;
    const tick = () => {
        if (!this.activeBuff || Date.now() >= this.activeBuff.expiresAt) {
            this.activeBuff = null;
            if (bar) bar.setAttribute('hidden', '');
            return;
        }
        const remaining = (this.activeBuff.expiresAt - Date.now()) / 1000;
        const progress  = remaining / totalDuration;
        if (label) label.textContent = `${this.activeBuff.label} x${this.activeBuff.mult.toFixed(1)} — ${Math.ceil(remaining)}s`;
        if (fill)  fill.style.transform = `scaleX(${Math.max(0, progress)})`;
        setTimeout(tick, 200);
    };
    tick();
};

// ───────────────────────────── PURCHASES ─────────────────────────────
GpuClicker.prototype._currentBuyQty = function (building, owned) {
    if (this.buyQty === 'max') return Math.max(1, maxAffordable(building, owned, this.state.frames));
    return this.buyQty;
};

GpuClicker.prototype.purchaseBuilding = function (i) {
    const building = BUILDINGS[i];
    if (!building) return;
    const owned = this.state.buildings[i].owned;
    const qty   = this._currentBuyQty(building, owned);
    if (qty <= 0) { this._showToast('Not enough frames!'); return; }
    const cost = buildingBulkCost(building, owned, qty);
    if (this.state.frames < cost) { this._showToast('Not enough frames!'); return; }

    this.state.frames -= cost;
    this.state.buildings[i].owned += qty;

    // reveal next building row
    const nextEl = document.getElementById(`bld_${i + 1}`);
    if (nextEl) nextEl.classList.remove('locked');

    this.updateDisplay(true);
};

GpuClicker.prototype._findShopItem = function (key) {
    let item = this.buildingUpgrades.find(u => u.key === key);
    if (item) return { item, kind: 'building' };
    item = CLICK_UPGRADES.find(u => u.key === key);
    if (item) return { item, kind: 'click' };
    item = GLOBAL_UPGRADES.find(u => u.key === key);
    if (item) return { item, kind: 'global' };
    item = CHIP_UPGRADES.find(u => u.key === key);
    if (item) return { item, kind: 'chip' };
    return null;
};

GpuClicker.prototype.purchaseShopItem = function (key) {
    const found = this._findShopItem(key);
    if (!found) return;
    const { item, kind } = found;
    const stateMap = {
        building: this.state.buildingUpgrades,
        click:    this.state.clickUpgrades,
        global:   this.state.globalUpgrades,
        chip:     this.state.chipUpgrades,
    }[kind];

    if (stateMap[key]) return; // already owned
    if (this.state.frames < item.cost) { this._showToast('Not enough frames!'); return; }

    this.state.frames -= item.cost;
    stateMap[key] = true;

    if (kind === 'chip') {
        clearTimeout(this.chipSpawnTimer);
        this._scheduleChip();
    }

    const card = document.getElementById(`card_${key}`);
    if (card) card.remove();

    this.updateDisplay(true);
    log.info(`Purchased ${kind} upgrade: ${item.name}`);
};

// ───────────────────────────── ACHIEVEMENTS ─────────────────────────────
GpuClicker.prototype._checkAchievements = function () {
    // Throttle: only check every ~1s worth of frames via a counter
    this._achCheckCounter = (this._achCheckCounter || 0) + 1;
    if (this._achCheckCounter % 30 !== 0) return; // ~every 30 frames

    for (const a of this.achievementsList) {
        if (this.state.achievements[a.key]) continue;
        if (a.check(this.state)) {
            this.state.achievements[a.key] = true;
            this._showToast(`🏆 Achievement: ${a.name}`, 'achievement');
        }
    }
};

GpuClicker.prototype._renderAchievements = function () {
    const grid = document.getElementById('achievementsGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const unlockedCount = this.achievementsList.filter(a => this.state.achievements[a.key]).length;
    document.getElementById('achievementsProgress').textContent = `${unlockedCount} / ${this.achievementsList.length}`;
    this.achievementsList.forEach(a => {
        const unlocked = !!this.state.achievements[a.key];
        const card = document.createElement('div');
        card.className = 'ach-card' + (unlocked ? ' unlocked' : '');
        card.innerHTML = `
            <span class="ach-icon">${unlocked ? '🏆' : '🔒'}</span>
            <span class="ach-name">${unlocked ? a.name : '???'}</span>
            <span class="ach-desc">${unlocked ? a.desc : 'Locked'}</span>
        `;
        grid.appendChild(card);
    });
};

// ───────────────────────────── PRESTIGE ─────────────────────────────
GpuClicker.prototype._renderPrestige = function () {
    const potential = driverPointsFor(this.state.lifetimeFrames);
    const gain = Math.max(0, potential - this.state.driverPoints);
    document.getElementById('prestigeCurrentPoints').textContent = this.state.driverPoints.toLocaleString();
    document.getElementById('prestigeGainPoints').textContent = gain.toLocaleString();
    document.getElementById('prestigeNewMult').textContent = `x${driverPointMultiplier(potential).toFixed(2)}`;
    const btn = document.getElementById('confirmPrestige');
    btn.disabled = gain <= 0;
    btn.textContent = gain > 0 ? `Update Drivers (+${gain.toLocaleString()} pts)` : 'Not enough lifetime frames yet';
};

GpuClicker.prototype._doPrestige = function () {
    const potential = driverPointsFor(this.state.lifetimeFrames);
    if (potential <= this.state.driverPoints) return;

    this.state.driverPoints   = potential;
    this.state.prestigeCount += 1;
    this.state.frames = 0;
    this.state.buildings = BUILDINGS.map(() => ({ owned: 0 }));
    this.state.buildingUpgrades = {};
    this.state.globalUpgrades   = {};
    this.state.chipUpgrades     = {};
    // Click upgrades are kept as a small QoL nod (cheap early-game investment
    // shouldn't be punished every reset) — lifetimeFrames, achievements, and
    // driver points persist by design.

    this._rebuildShopAfterPrestige();
    this._closeModal('prestigeModal');
    this._showToast(`Driver Update complete! ${this.state.driverPoints} Driver Points active.`, 'magic');
    this.updateDisplay(true);
};

GpuClicker.prototype._rebuildShopAfterPrestige = function () {
    // Re-show any building/global/chip upgrade cards that were removed on purchase
    document.getElementById('buildingUpgradesContainer').innerHTML = '';
    document.getElementById('globalUpgradesContainer').innerHTML = '';
    document.getElementById('chipUpgradesContainer').innerHTML = '';
    const bldC    = document.getElementById('buildingUpgradesContainer');
    const globalC = document.getElementById('globalUpgradesContainer');
    const chipC   = document.getElementById('chipUpgradesContainer');
    const makeCard = (key, name, desc, badgeText, badgeClass) => {
        const el = document.createElement('div');
        el.className = 'upgrade-card';
        el.id = `card_${key}`;
        el.hidden = true;
        el.innerHTML = `
            <button class="upgrade-btn" id="btn_${key}" aria-label="${name}: ${desc}">
                <span class="upg-top">
                    <span class="upg-name">${name}</span>
                    <span class="upg-badge ${badgeClass}">${badgeText}</span>
                </span>
                <span class="upg-desc">${desc}</span>
                <span class="upg-price" id="price_${key}">–</span>
            </button>
        `;
        return el;
    };
    GLOBAL_UPGRADES.forEach(u => globalC.appendChild(makeCard(u.key, u.name, u.desc, 'GLOBAL', 'badge-global')));
    CHIP_UPGRADES.forEach(u => chipC.appendChild(makeCard(u.key, u.name, u.desc, 'CHIP', 'badge-chip')));
    this.buildingUpgrades.forEach(u => bldC.appendChild(makeCard(u.key, `${u.glyph} ${u.name}`, u.desc, 'GPU', 'badge-gpu')));
    // reset building row lock visuals
    document.querySelectorAll('.building-row').forEach((row, i) => {
        if (i > 0) row.classList.add('locked');
    });
};

// ───────────────────────────── DISPLAY UPDATE ─────────────────────────────
GpuClicker.prototype.updateDisplay = function (full) {
    const fps = this.calcFPS();

    this._setText('framesValue', shortenNumber(this.state.frames));
    this._setText('fpsValue', shortenNumber(fps));

    document.title = this.settings.titleFPS
        ? `${shortenNumber(fps)}/s – GPU Clicker`
        : `${shortenNumber(this.state.frames)} Frames – GPU Clicker`;

    // Buildings — price text only needs refresh every frame; row reveal logic
    // (full=true) on purchases / load.
    BUILDINGS.forEach((b, i) => {
        const owned = this.state.buildings[i].owned;
        const btn   = document.getElementById(`bldBtn_${i}`);
        const priceEl = document.getElementById(`bldPrice_${i}`);
        const ownedEl = document.getElementById(`bldOwned_${i}`);
        const fpsEl   = document.getElementById(`bldFps_${i}`);
        if (!btn || !priceEl) return;

        const qty  = this._currentBuyQty(b, owned);
        const cost = buildingBulkCost(b, owned, Math.max(1, qty));
        priceEl.textContent = shortenNumber(cost);
        btn.disabled = this.state.frames < cost || qty <= 0;
        if (ownedEl) ownedEl.textContent = owned;
        if (fpsEl) fpsEl.textContent = `+${shortenNumber(b.baseFps * this.buildingMultiplier(i))}/s each`;

        const row = document.getElementById(`bld_${i}`);
        if (row) {
            const shouldLock = i > 0 && this.state.buildings[i - 1].owned === 0 && owned === 0;
            row.classList.toggle('locked', shouldLock);
        }
    });

    if (full) this._refreshShopVisibility();
    else this._refreshAffordablePrices();

    if (this.settings.showStats) this._updateStats(fps);
};

GpuClicker.prototype._allShopGroups = function () {
    return [
        { list: this.buildingUpgrades, stateMap: this.state.buildingUpgrades, gate: u => totalOwnedFor(this.state, u.buildingIndex) >= u.threshold },
        { list: CLICK_UPGRADES, stateMap: this.state.clickUpgrades, gate: u => this.state.lifetimeFrames >= u.lifetimeReq },
        { list: GLOBAL_UPGRADES, stateMap: this.state.globalUpgrades, gate: u => this.state.lifetimeFrames >= u.lifetimeReq },
        { list: CHIP_UPGRADES, stateMap: this.state.chipUpgrades, gate: u => this.state.lifetimeFrames >= u.lifetimeReq },
    ];
};

function totalOwnedFor(state, buildingIndex) {
    return state.buildings[buildingIndex]?.owned ?? 0;
}

GpuClicker.prototype._refreshShopVisibility = function () {
    this._allShopGroups().forEach(group => {
        group.list.forEach(u => {
            const card = document.getElementById(`card_${u.key}`);
            if (!card) return;
            if (group.stateMap[u.key]) { card.remove(); return; }
            const unlocked = group.gate(u);
            card.hidden = !unlocked;
            if (unlocked) {
                const btn = document.getElementById(`btn_${u.key}`);
                const priceEl = document.getElementById(`price_${u.key}`);
                if (priceEl) priceEl.textContent = shortenNumber(u.cost);
                if (btn) btn.disabled = this.state.frames < u.cost;
            }
        });
    });
    this._updateTabBadges();
};

GpuClicker.prototype._refreshAffordablePrices = function () {
    this._allShopGroups().forEach(group => {
        group.list.forEach(u => {
            if (group.stateMap[u.key]) return;
            const card = document.getElementById(`card_${u.key}`);
            if (!card || card.hidden) return;
            const btn = document.getElementById(`btn_${u.key}`);
            if (btn) btn.disabled = this.state.frames < u.cost;
        });
    });
};

GpuClicker.prototype._updateTabBadges = function () {
    const counts = { click: 0, global: 0, chip: 0, building: 0 };
    this._allShopGroups().forEach((group, idx) => {
        const key = ['building', 'click', 'global', 'chip'][idx];
        group.list.forEach(u => {
            if (!group.stateMap[u.key] && group.gate(u) && this.state.frames >= u.cost) counts[key]++;
        });
    });
    const map = { building: 'gpu', click: 'click', global: 'global', chip: 'chip' };
    Object.entries(map).forEach(([k, tabKey]) => {
        const el = document.getElementById(`tabBadge_${tabKey}`);
        if (!el) return;
        el.textContent = counts[k] > 0 ? counts[k] : '';
        el.classList.toggle('show', counts[k] > 0);
    });
};

GpuClicker.prototype._updateStats = function (fps) {
    if (fps > this.state.peakFPS) this.state.peakFPS = fps;
    this._setText('stat-lifetimeFrames', shortenNumber(this.state.lifetimeFrames));
    this._setText('stat-totalClicks', this.state.totalClicks.toLocaleString());
    this._setText('stat-clickValue', shortenNumber(this.calcClickValue()) + ' / click');
    this._setText('stat-globalMult', 'x' + shortenNumber(this.globalMultiplier()));
    this._setText('stat-gpusOwned', totalOwned(this.state).toLocaleString());
    this._setText('stat-peakFPS', shortenNumber(this.state.peakFPS) + ' / s');
    this._setText('stat-driverPoints', this.state.driverPoints.toLocaleString());
    this._setText('stat-chipsCollected', this.state.chipsCollected.toLocaleString());
    this._setText('stat-sessionTime', formatTime((Date.now() - this.state.sessionStart) / 1000));
    this._setText('stat-chipRate', `~${Math.round(this.chipIntervalS())}s`);
};

GpuClicker.prototype._setText = function (id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};

// ───────────────────────────── TOAST ─────────────────────────────
GpuClicker.prototype._showToast = function (msg, type = 'error') {
    const containerId = type === 'achievement' ? 'achToast' : 'toast';
    const toast = document.getElementById(containerId);
    if (!toast) return;
    toast.textContent = msg;
    toast.dataset.type = type;
    toast.classList.add('show');
    const timerKey = type === 'achievement' ? 'achToastTimer' : 'toastTimer';
    clearTimeout(this[timerKey]);
    const dur = type === 'magic' ? 4000 : type === 'chip' ? 3500 : type === 'achievement' ? 3500 : 2000;
    this[timerKey] = setTimeout(() => toast.classList.remove('show'), dur);
};

// ───────────────────────────── SETTINGS PERSISTENCE ─────────────────────────────
GpuClicker.prototype.loadSettings = function () {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        if (!raw) return;
        this.settings = { ...defaultSettings(), ...JSON.parse(raw) };
    } catch (err) {
        log.warn('Settings load failed, using defaults:', err.message);
        this.settings = defaultSettings();
    }
};
GpuClicker.prototype.saveSettings = function () {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); }
    catch (err) { log.warn('Settings save failed:', err.message); }
};

// ───────────────────────────── SAVE / LOAD ─────────────────────────────
GpuClicker.prototype.saveGame = function () {
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({
            v: SAVE_VERSION,
            frames:           this.state.frames,
            lifetimeFrames:   this.state.lifetimeFrames,
            totalClicks:      this.state.totalClicks,
            peakFPS:          this.state.peakFPS,
            chipsCollected:   this.state.chipsCollected,
            prestigeCount:    this.state.prestigeCount,
            driverPoints:     this.state.driverPoints,
            buildings:        this.state.buildings.map(b => b.owned),
            buildingUpgrades: this.state.buildingUpgrades,
            clickUpgrades:    this.state.clickUpgrades,
            globalUpgrades:   this.state.globalUpgrades,
            chipUpgrades:     this.state.chipUpgrades,
            achievements:     this.state.achievements,
            sessionStart:     this.state.sessionStart,
        }));
    } catch (err) { log.warn('Save failed:', err.message); }
};

GpuClicker.prototype.loadGame = function () {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) { log.info('No save — fresh start'); return; }
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') throw new GameError('BAD_SAVE', 'Not an object');

        const n = (k, fb = 0) => { const v = data[k]; return (typeof v === 'number' && isFinite(v)) ? v : fb; };
        this.state.frames         = n('frames');
        this.state.lifetimeFrames = n('lifetimeFrames', n('frames'));
        this.state.totalClicks    = n('totalClicks');
        this.state.peakFPS        = n('peakFPS');
        this.state.chipsCollected = n('chipsCollected');
        this.state.prestigeCount  = n('prestigeCount');
        this.state.driverPoints   = n('driverPoints');
        this.state.sessionStart   = Date.now(); // session time always restarts on load

        if (Array.isArray(data.buildings)) {
            data.buildings.forEach((owned, i) => {
                if (this.state.buildings[i] && typeof owned === 'number' && owned >= 0) {
                    this.state.buildings[i].owned = Math.floor(owned);
                }
            });
        }
        ['buildingUpgrades', 'clickUpgrades', 'globalUpgrades', 'chipUpgrades', 'achievements'].forEach(k => {
            if (data[k] && typeof data[k] === 'object') this.state[k] = { ...data[k] };
        });

        log.info('Save loaded.');
    } catch (err) {
        log.warn('Load failed, starting fresh:', err.message);
    }
};

// ───────────────────────────── BUY-QTY BUTTON INIT (price preview) ─────────────────────────────
GpuClicker.prototype.initBuyQtyDisplay = function () {
    const btn = document.querySelector('.buy-qty-btn[data-qty="1"]');
    if (btn) btn.classList.add('active');
};

// =========================================================================
// BOOT
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    const game = new GpuClicker();
    game.initBuyQtyDisplay();

    // ===== CONSOLE COMMANDS =====
    window.GPC = Object.freeze({
        help() {
            console.group('%c[GPC] Available commands', 'color:#76B900;font-weight:bold');
            const cmds = [
                ['GPC.help()',                 'Print this command list'],
                ['GPC.debug()',                'Print all current game values'],
                ['GPC.setFrames(n)',           'Set current frames to n'],
                ['GPC.addFrames(n)',           'Add n frames (negative to subtract)'],
                ['GPC.setBuilding(i, count)',  'Set owned count for building index i'],
                ['GPC.buyAllBuildings(count)', 'Set every building to count'],
                ['GPC.unlockAllUpgrades()',    'Mark all shop upgrades as purchased'],
                ['GPC.triggerChip()',          'Force the Golden Chip to appear now'],
                ['GPC.setDriverPoints(n)',     'Set Driver Points directly (debug only)'],
                ['GPC.resetSave()',            'Wipe localStorage save and reload'],
                ['GPC.exportSave()',           'Print save JSON to console'],
                ['GPC.importSave(json)',       'Load a save from a JSON string'],
            ];
            console.table(cmds.map(([cmd, desc]) => ({ command: cmd, description: desc })));
            console.groupEnd();
        },
        debug() {
            console.group('%c[GPC] Debug snapshot', 'color:#76B900;font-weight:bold');
            console.log('frames:', shortenNumber(game.state.frames), `(${game.state.frames})`);
            console.log('lifetime:', shortenNumber(game.state.lifetimeFrames));
            console.log('fps:', shortenNumber(game.calcFPS()), 'raw:', shortenNumber(game.rawFps()));
            console.log('global mult:', game.globalMultiplier().toFixed(4));
            console.log('click value:', shortenNumber(game.calcClickValue()));
            console.log('driver points:', game.state.driverPoints);
            console.table(BUILDINGS.map((b, i) => ({
                name: b.name, owned: game.state.buildings[i].owned,
                nextCost: shortenNumber(buildingCost(b, game.state.buildings[i].owned)),
            })));
            console.groupEnd();
        },
        setFrames(n) {
            if (typeof n !== 'number' || !isFinite(n) || n < 0) return log.error('expected non-negative number');
            game.state.frames = n; game.updateDisplay(true);
        },
        addFrames(n) {
            if (typeof n !== 'number' || !isFinite(n)) return log.error('expected a number');
            game.state.frames = Math.max(0, game.state.frames + n);
            game.state.lifetimeFrames += Math.max(0, n);
            game.updateDisplay(true);
        },
        setBuilding(i, count = 10) {
            if (!BUILDINGS[i]) return log.error('invalid building index');
            game.state.buildings[i].owned = Math.max(0, Math.floor(count));
            game.updateDisplay(true);
        },
        buyAllBuildings(count = 10) {
            BUILDINGS.forEach((_, i) => { game.state.buildings[i].owned = Math.max(0, Math.floor(count)); });
            game.updateDisplay(true);
        },
        unlockAllUpgrades() {
            game.buildingUpgrades.forEach(u => game.state.buildingUpgrades[u.key] = true);
            CLICK_UPGRADES.forEach(u => game.state.clickUpgrades[u.key] = true);
            GLOBAL_UPGRADES.forEach(u => game.state.globalUpgrades[u.key] = true);
            CHIP_UPGRADES.forEach(u => game.state.chipUpgrades[u.key] = true);
            game._refreshShopVisibility();
            game.updateDisplay(true);
        },
        triggerChip() {
            clearTimeout(game.chipSpawnTimer);
            game._showChip();
        },
        setDriverPoints(n) {
            if (typeof n !== 'number' || !isFinite(n) || n < 0) return log.error('expected non-negative number');
            game.state.driverPoints = Math.floor(n);
            game.updateDisplay(true);
        },
        resetSave() {
            localStorage.removeItem(SAVE_KEY);
            setTimeout(() => location.reload(), 200);
        },
        exportSave() {
            game.saveGame();
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return log.warn('no save found');
            console.log(JSON.stringify(JSON.parse(raw), null, 2));
        },
        importSave(json) {
            try { JSON.parse(json); } catch (e) { return log.error('invalid JSON'); }
            localStorage.setItem(SAVE_KEY, json);
            setTimeout(() => location.reload(), 200);
        },
    });

    console.log('%c[GPC]%c Type %cGPC.help()%c for console commands.',
        'color:#76B900;font-weight:bold', 'color:inherit',
        'color:#76B900;font-weight:bold', 'color:inherit');
});
