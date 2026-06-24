const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { GoalNear, GoalXZ } = goals;
const fs = require('fs');
const path = require('path');

// Persistent registration state — saved to disk so bot knows if account is already registered
const REG_FILE = path.join(__dirname, '..', 'registered_accounts.json');

function loadRegistered() {
  try {
    if (fs.existsSync(REG_FILE)) return JSON.parse(fs.readFileSync(REG_FILE, 'utf8'));
  } catch (_) {}
  return {};
}

function saveRegistered(data) {
  try { fs.writeFileSync(REG_FILE, JSON.stringify(data, null, 2)); } catch (_) {}
}

async function createBot(username, logger, discordBot, callbacks) {
  const bot = mineflayer.createBot({
    host: process.env.MC_HOST || 'localhost',
    port: parseInt(process.env.MC_PORT || '25565'),
    username: username,
    version: process.env.MC_VERSION || '1.20.1',
    auth: 'offline',
    hideErrors: false,
  });

  bot.loadPlugin(pathfinder);

  const password = process.env.LOGIN_PASSWORD || 'BotPass123!';
  let authState = 'pending'; // pending | registering | logging_in | authed
  let behaviorInterval = null;
  let isChoppingTree = false;
  let registered = loadRegistered();

  // ─── Message / Auth Handler ──────────────────────────────────────
  bot.on('message', (jsonMsg) => {
    const raw = jsonMsg.toString();
    const msg = raw.replace(/§[0-9a-fklmnor]/gi, '').toLowerCase().trim();
    logger.info(`[Chat] ${raw}`);

    // Don't reprocess if already authenticated
    if (authState === 'authed') {
      discordBot?.sendChat(`💬 **[${username}]** ${raw}`);
      return;
    }

    // ── REGISTER prompts ─────────────────────────────────────────
    const needsRegister = [
      'please register', 'you need to register', '/register',
      'use /register', 'not registered', 'register to play',
      'hasn\'t been registered', 'account is not registered',
    ].some(t => msg.includes(t));

    if (needsRegister && authState === 'pending') {
      authState = 'registering';
      logger.info(`[Auth] ${username} needs to register — sending /register`);
      discordBot?.sendStatus(`📝 Registering account **${username}**...`);
      setTimeout(() => {
        bot.chat(`/register ${password} ${password}`);
        logger.info(`[Auth] Sent: /register ${password} ${password}`);
      }, randomBetween(1000, 2000));
      return;
    }

    // ── LOGIN prompts ─────────────────────────────────────────────
    const needsLogin = [
      'please login', 'you need to login', '/login',
      'use /login', 'already registered', 'login to play',
      'log in', 'type /login', 'login with /login',
      'password', 'authentification', '/l ',
    ].some(t => msg.includes(t));

    if (needsLogin && (authState === 'pending' || authState === 'registering')) {
      authState = 'logging_in';
      logger.info(`[Auth] ${username} needs to login — sending /login`);
      discordBot?.sendStatus(`🔑 Logging in as **${username}**...`);
      setTimeout(() => {
        bot.chat(`/login ${password}`);
        logger.info(`[Auth] Sent: /login ${password}`);
      }, randomBetween(1000, 2000));
      return;
    }

    // ── SUCCESS indicators ────────────────────────────────────────
    const loginSuccess = [
      'successfully logged in', 'you are now logged in',
      'logged in successfully', 'welcome back',
      'authentication successful', 'you are logged in',
      'login successful', 'authenticated',
    ].some(t => msg.includes(t));

    const registerSuccess = [
      'successfully registered', 'registered successfully',
      'registration successful', 'account created',
      'you are now registered', 'register successful',
    ].some(t => msg.includes(t));

    if (registerSuccess && authState === 'registering') {
      logger.info(`[Auth] ${username} registered! Now logging in...`);
      discordBot?.sendStatus(`✅ **${username}** registered! Logging in...`);
      registered[username] = true;
      saveRegistered(registered);
      authState = 'logging_in';
      setTimeout(() => {
        bot.chat(`/login ${password}`);
      }, randomBetween(1200, 2000));
      return;
    }

    if (loginSuccess || (registerSuccess && authState !== 'registering')) {
      onAuthSuccess();
    }

    discordBot?.sendChat(`💬 **[${username}]** ${raw}`);
  });

  // ─── Spawn Handler ────────────────────────────────────────────────
  bot.once('spawn', () => {
    logger.info(`[MC] Bot spawned as ${username}`);
    authState = 'pending';

    // Some servers require login immediately on spawn without showing a prompt
    // Use saved registration state to decide register vs login
    setTimeout(() => {
      if (authState !== 'authed') {
        const isRegistered = registered[username] === true;
        if (isRegistered) {
          logger.info(`[Auth] ${username} is saved as registered — auto-sending /login`);
          authState = 'logging_in';
          bot.chat(`/login ${password}`);
        } else {
          logger.info(`[Auth] ${username} not in saved list — sending /register just in case`);
          authState = 'registering';
          bot.chat(`/register ${password} ${password}`);
          // Fallback: if register fails (already registered), also try login after delay
          setTimeout(() => {
            if (authState !== 'authed') {
              logger.info(`[Auth] Fallback — also trying /login for ${username}`);
              bot.chat(`/login ${password}`);
            }
          }, 3000);
        }
      }
    }, randomBetween(1500, 2500));
  });

  function onAuthSuccess() {
    if (authState === 'authed') return;
    authState = 'authed';
    registered[username] = true;
    saveRegistered(registered);
    logger.info(`[Auth] ✅ ${username} fully authenticated!`);
    discordBot?.sendStatus(`✅ **${username}** is logged in and active!`);
    callbacks.onLogin?.();
    setTimeout(startNaturalBehavior, randomBetween(1500, 3000));
  }

  // ─── Kicked Handler ──────────────────────────────────────────────
  bot.on('kicked', (reason) => {
    stopBehaviors();
    const clean = reason?.toString().replace(/§./g, '') || 'Unknown';
    logger.warn(`[MC] ${username} kicked: ${clean}`);
    callbacks.onKicked?.(reason);
  });

  bot.on('error', (err) => {
    logger.warn(`[MC] Error (${username}): ${err.message}`);
    if (['ECONNREFUSED','ETIMEDOUT','ENOTFOUND'].includes(err.code)) {
      callbacks.onError?.(err);
    }
  });

  bot.on('end', (reason) => {
    stopBehaviors();
    logger.info(`[MC] ${username} disconnected: ${reason}`);
  });

  // ─── Natural Behavior System ──────────────────────────────────────
  function startNaturalBehavior() {
    stopBehaviors();
    logger.info(`[Behavior] Starting natural behavior for ${username}`);

    const actions = [
      { weight: 28, fn: doRandomWalk },
      { weight: 20, fn: doLookAround },
      { weight: 15, fn: doJump },
      { weight: 10, fn: doSneak },
      { weight: 10, fn: doSwingArm },
      { weight: 9,  fn: doInventoryCheck },
      { weight: 8,  fn: doIdleStand },
    ];
    const totalWeight = actions.reduce((s, a) => s + a.weight, 0);

    function pickAction() {
      let rand = Math.random() * totalWeight;
      for (const a of actions) { rand -= a.weight; if (rand <= 0) return a.fn; }
      return doIdleStand;
    }

    function scheduleNext() {
      if (isChoppingTree) return;
      behaviorInterval = setTimeout(async () => {
        try { if (!isChoppingTree) await pickAction()(); } catch (_) {}
        scheduleNext();
      }, randomBetween(8000, 25000));
    }

    scheduleNext();
  }

  function stopBehaviors() {
    if (behaviorInterval) { clearTimeout(behaviorInterval); behaviorInterval = null; }
    isChoppingTree = false;
    try { bot.clearControlStates(); } catch (_) {}
  }

  // ─── Natural Actions ──────────────────────────────────────────────
  async function doRandomWalk() {
    try {
      const move = new Movements(bot);
      move.canDig = false;
      bot.pathfinder.setMovements(move);
      const pos = bot.entity.position;
      const goal = new GoalXZ(
        Math.floor(pos.x + randomBetween(-8, 8)),
        Math.floor(pos.z + randomBetween(-8, 8))
      );
      await bot.pathfinder.goto(goal);
      await sleep(randomBetween(1000, 3000));
    } catch (_) {}
  }

  async function doLookAround() {
    const turns = randomBetween(1, 3);
    for (let i = 0; i < turns; i++) {
      await bot.look((Math.random() * Math.PI * 2) - Math.PI, (Math.random() * 1.0) - 0.5, true);
      await sleep(randomBetween(600, 2000));
    }
  }

  async function doJump() {
    bot.setControlState('jump', true);
    await sleep(200);
    bot.setControlState('jump', false);
    if (Math.random() > 0.5) {
      bot.setControlState('forward', true);
      await sleep(randomBetween(300, 700));
      bot.setControlState('jump', true);
      await sleep(200);
      bot.setControlState('jump', false);
      await sleep(300);
      bot.setControlState('forward', false);
    }
  }

  async function doSneak() {
    bot.setControlState('sneak', true);
    await sleep(randomBetween(1000, 3500));
    bot.setControlState('sneak', false);
  }

  async function doSwingArm() {
    bot.swingArm('right');
    await sleep(randomBetween(300, 800));
    if (Math.random() > 0.5) { await sleep(400); bot.swingArm('left'); }
  }

  async function doInventoryCheck() {
    try { await bot.openChest(bot.entity); } catch (_) {}
    await sleep(randomBetween(1500, 3000));
  }

  async function doIdleStand() {
    await sleep(randomBetween(4000, 10000));
  }

  // ─── Tree Chopping ────────────────────────────────────────────────
  bot.startChoppingTree = async function () {
    if (isChoppingTree) { discordBot?.sendStatus('⚠️ Already chopping!'); return; }
    isChoppingTree = true;
    discordBot?.sendStatus('🪓 Searching for a tree...');

    try {
      const logTypes = [
        'oak_log','birch_log','spruce_log','jungle_log',
        'acacia_log','dark_oak_log','mangrove_log','cherry_log'
      ];

      let target = null;
      for (const t of logTypes) {
        target = bot.findBlock({ matching: bot.registry.blocksByName[t]?.id, maxDistance: 32 });
        if (target) break;
      }

      if (!target) {
        discordBot?.sendStatus('🌲 No trees found within 32 blocks!');
        isChoppingTree = false;
        return;
      }

      discordBot?.sendStatus(`🌲 Found tree! Walking over to chop...`);
      const move = new Movements(bot);
      bot.pathfinder.setMovements(move);
      await bot.pathfinder.goto(new GoalNear(target.position.x, target.position.y, target.position.z, 2));

      let chopped = 0;
      let pos = target.position.clone();

      while (isChoppingTree && chopped < 12) {
        const block = bot.blockAt(pos);
        if (!block || !logTypes.includes(block.name)) break;
        await bot.lookAt(pos.offset(0.5, 0.5, 0.5));
        await sleep(randomBetween(100, 300));
        await bot.dig(block);
        chopped++;
        pos = pos.offset(0, 1, 0);
        await sleep(randomBetween(200, 500));
      }

      discordBot?.sendStatus(`✅ Chopped **${chopped} logs**!`);
    } catch (err) {
      discordBot?.sendStatus(`⚠️ Chop error: ${err.message}`);
    }

    isChoppingTree = false;
  };

  // ─── Manual Movement ─────────────────────────────────────────────
  bot.moveInDirection = function (dir) {
    const map = { forward:'forward', back:'back', left:'left', right:'right', jump:'jump', up:'jump' };
    const ctrl = map[dir?.toLowerCase()];
    if (!ctrl) return;
    bot.setControlState(ctrl, true);
    setTimeout(() => bot.setControlState(ctrl, false), 1500);
  };

  return bot;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randomBetween(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

module.exports = { createBot };
