require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createBot } = require('./src/mcBot');
const { createDiscordBot } = require('./src/discordBot');
const AccountManager = require('./src/accountManager');
const Logger = require('./src/logger');

const logger = new Logger();
const accountManager = new AccountManager(path.join(__dirname, 'usernames.txt'), logger);

let currentBot = null;
let discordBot = null;
let isRunning = false;
let switchTimeout = null;

async function startBot() {
  if (!isRunning) return;

  const username = accountManager.getNextAccount();
  if (!username) {
    logger.error('No accounts available! Add usernames to usernames.txt');
    discordBot?.sendStatus('❌ No accounts available in usernames.txt!');
    return;
  }

  logger.info(`Starting bot with account: ${username}`);
  discordBot?.sendStatus(`🟡 Connecting with account: **${username}**...`);

  // Clear any pending switch
  if (switchTimeout) {
    clearTimeout(switchTimeout);
    switchTimeout = null;
  }

  // Schedule preemptive account switch if configured
  const autoSwitchMinutes = parseInt(process.env.AUTO_SWITCH_MINUTES || '0');
  if (autoSwitchMinutes > 0) {
    const ms = autoSwitchMinutes * 60 * 1000;
    switchTimeout = setTimeout(() => {
      logger.info(`Preemptive switch after ${autoSwitchMinutes} minutes`);
      discordBot?.sendStatus(`⏱️ Preemptive account switch after ${autoSwitchMinutes} min (hosting bug workaround)`);
      switchAccount();
    }, ms);
  }

  try {
    currentBot = await createBot(username, logger, discordBot, {
      onKicked: (reason) => handleKick(reason, username),
      onError: (err) => handleError(err, username),
      onLogin: () => handleLogin(username),
    });
  } catch (err) {
    logger.error(`Failed to create bot: ${err.message}`);
    scheduleReconnect();
  }
}

function handleLogin(username) {
  accountManager.markSuccess(username);
  logger.info(`✅ Bot logged in as ${username}`);
  discordBot?.sendStatus(`✅ Bot online as **${username}** | Accounts available: ${accountManager.getAccountCount()}`);
}

function handleKick(reason, username) {
  const cleanReason = reason?.toString().replace(/§./g, '') || 'Unknown reason';
  logger.warn(`Account ${username} was kicked: ${cleanReason}`);
  accountManager.markKicked(username);
  discordBot?.sendStatus(`⚠️ **${username}** was kicked: \`${cleanReason}\`\n🔄 Switching account...`);

  if (isRunning) {
    setTimeout(() => startBot(), (parseInt(process.env.RECONNECT_DELAY || '5')) * 1000);
  }
}

function handleError(err, username) {
  logger.error(`Bot error for ${username}: ${err.message}`);
  if (isRunning) {
    setTimeout(() => startBot(), (parseInt(process.env.RECONNECT_DELAY || '5')) * 1000);
  }
}

function switchAccount() {
  if (currentBot) {
    currentBot.quit('Switching account');
    currentBot = null;
  }
  if (isRunning) {
    setTimeout(() => startBot(), 2000);
  }
}

function scheduleReconnect() {
  const delay = parseInt(process.env.RECONNECT_DELAY || '5') * 1000;
  setTimeout(() => {
    if (isRunning) startBot();
  }, delay);
}

async function main() {
  logger.info('🤖 MC AFK Bot starting up...');
  logger.info(`📋 Loaded ${accountManager.getAccountCount()} accounts`);

  // Start Discord bot first
  discordBot = await createDiscordBot(logger, {
    onStart: () => {
      isRunning = true;
      startBot();
    },
    onStop: () => {
      isRunning = false;
      if (switchTimeout) clearTimeout(switchTimeout);
      if (currentBot) {
        currentBot.quit('Bot stopped via Discord');
        currentBot = null;
      }
      discordBot?.sendStatus('🔴 Bot stopped.');
    },
    onSwitch: () => {
      discordBot?.sendStatus('🔄 Manual account switch triggered...');
      switchAccount();
    },
    onStatus: () => {
      const account = accountManager.getCurrentAccount();
      const stats = accountManager.getStats();
      return {
        running: isRunning,
        currentAccount: account,
        stats,
        accountCount: accountManager.getAccountCount(),
      };
    },
    onSay: (message) => {
      if (currentBot) {
        currentBot.chat(message);
        return true;
      }
      return false;
    },
    onMove: (direction) => {
      if (currentBot) {
        currentBot.moveInDirection(direction);
        return true;
      }
      return false;
    },
    onChopTree: () => {
      if (currentBot) {
        currentBot.startChoppingTree();
        return true;
      }
      return false;
    },
    getBot: () => currentBot,
  });

  logger.info('✅ Discord bot ready. Use !start in your Discord channel to begin.');
}

main().catch(err => {
  logger.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
