const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

async function createDiscordBot(logger, callbacks) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const prefix = process.env.DISCORD_PREFIX || '!';
  const channelId = process.env.DISCORD_CHANNEL_ID;
  let statusChannel = null;

  client.once('ready', () => {
    logger.info(`Discord bot logged in as ${client.user.tag}`);
    if (channelId) {
      statusChannel = client.channels.cache.get(channelId);
      if (statusChannel) {
        statusChannel.send('🤖 **MC AFK Bot is online!** Use `!help` to see commands.');
      }
    }
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;
    if (channelId && message.channel.id !== channelId) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    switch (command) {
      case 'start': {
        callbacks.onStart?.();
        message.reply('✅ Bot starting! Connecting to Minecraft server...');
        break;
      }

      case 'stop': {
        callbacks.onStop?.();
        message.reply('🔴 Bot stopped.');
        break;
      }

      case 'switch': {
        callbacks.onSwitch?.();
        message.reply('🔄 Switching to next account...');
        break;
      }

      case 'status': {
        const data = callbacks.onStatus?.();
        if (!data) { message.reply('Bot not initialized.'); break; }

        const embed = new EmbedBuilder()
          .setTitle('🤖 MC AFK Bot Status')
          .setColor(data.running ? 0x00ff88 : 0xff4444)
          .addFields(
            { name: '📡 Status', value: data.running ? '🟢 Running' : '🔴 Stopped', inline: true },
            { name: '👤 Current Account', value: data.currentAccount || 'None', inline: true },
            { name: '📋 Total Accounts', value: String(data.accountCount), inline: true },
          )
          .setTimestamp();

        // Add account stats
        if (data.stats && Object.keys(data.stats).length > 0) {
          const statsText = Object.entries(data.stats)
            .map(([acc, s]) => `**${acc}**: ${s.status} | Sessions: ${s.sessions} | Kicks: ${s.kicks}`)
            .join('\n');
          embed.addFields({ name: '📊 Account Stats', value: statsText || 'None' });
        }

        message.reply({ embeds: [embed] });
        break;
      }

      case 'say': {
        const text = args.join(' ');
        if (!text) { message.reply('Usage: `!say <message>`'); break; }
        const sent = callbacks.onSay?.(text);
        if (sent) message.reply(`✅ Sent: \`${text}\``);
        else message.reply('❌ Bot is not connected.');
        break;
      }

      case 'move': {
        const dir = args[0];
        if (!dir) { message.reply('Usage: `!move <forward|back|left|right|jump>`'); break; }
        const moved = callbacks.onMove?.(dir);
        if (moved) message.reply(`✅ Moving: **${dir}**`);
        else message.reply('❌ Bot is not connected.');
        break;
      }

      case 'chop': {
        const started = callbacks.onChopTree?.();
        if (started) message.reply('🪓 Started chopping trees!');
        else message.reply('❌ Bot is not connected.');
        break;
      }

      case 'pos': {
        const bot = callbacks.getBot?.();
        if (!bot || !bot.entity) { message.reply('❌ Bot is not connected.'); break; }
        const pos = bot.entity.position;
        message.reply(`📍 Position: **X:** ${Math.floor(pos.x)} **Y:** ${Math.floor(pos.y)} **Z:** ${Math.floor(pos.z)}`);
        break;
      }

      case 'health': {
        const bot = callbacks.getBot?.();
        if (!bot) { message.reply('❌ Bot is not connected.'); break; }
        const hp = Math.round(bot.health || 0);
        const food = Math.round(bot.food || 0);
        const bar = '❤️'.repeat(Math.ceil(hp / 2)) + '🖤'.repeat(10 - Math.ceil(hp / 2));
        message.reply(`💚 Health: **${hp}/20** ${bar}\n🍖 Food: **${food}/20**`);
        break;
      }

      case 'look': {
        const [yawStr, pitchStr] = args;
        const bot = callbacks.getBot?.();
        if (!bot) { message.reply('❌ Bot not connected.'); break; }
        const yaw = parseFloat(yawStr) || 0;
        const pitch = parseFloat(pitchStr) || 0;
        bot.look(yaw, pitch, true);
        message.reply(`👀 Looking at yaw: ${yaw}, pitch: ${pitch}`);
        break;
      }

      case 'accounts': {
        const data = callbacks.onStatus?.();
        if (!data?.stats) { message.reply('No account data.'); break; }
        const list = Object.entries(data.stats)
          .map(([acc, s]) => {
            const icon = s.status === 'online' ? '🟢' : s.status === 'kicked' ? '🔴' : '⚪';
            return `${icon} **${acc}** — Kicks: ${s.kicks} | Sessions: ${s.sessions}`;
          })
          .join('\n');
        const embed = new EmbedBuilder()
          .setTitle('👥 Account List')
          .setDescription(list || 'No accounts loaded.')
          .setColor(0x5865f2);
        message.reply({ embeds: [embed] });
        break;
      }

      case 'help': {
        const embed = new EmbedBuilder()
          .setTitle('🤖 MC AFK Bot Commands')
          .setColor(0x5865f2)
          .setDescription('Control your Minecraft AFK bot from Discord!')
          .addFields(
            { name: `${prefix}start`, value: 'Start the bot and connect to server', inline: false },
            { name: `${prefix}stop`, value: 'Stop the bot and disconnect', inline: false },
            { name: `${prefix}switch`, value: 'Manually switch to next account', inline: false },
            { name: `${prefix}status`, value: 'Show bot status and account stats', inline: false },
            { name: `${prefix}accounts`, value: 'List all accounts and their stats', inline: false },
            { name: `${prefix}say <msg>`, value: 'Send a chat message in-game', inline: false },
            { name: `${prefix}move <dir>`, value: 'Move bot (forward/back/left/right/jump)', inline: false },
            { name: `${prefix}chop`, value: 'Make bot chop nearest tree', inline: false },
            { name: `${prefix}pos`, value: 'Show bot current position', inline: false },
            { name: `${prefix}health`, value: 'Show bot health and food', inline: false },
          )
          .setFooter({ text: 'MC AFK Bot • Hosting Bug Workaround Edition' });
        message.reply({ embeds: [embed] });
        break;
      }

      default: {
        message.reply(`❓ Unknown command. Use \`${prefix}help\` to see all commands.`);
      }
    }
  });

  // Public methods for other modules to send messages
  client.sendStatus = (msg) => {
    if (statusChannel) statusChannel.send(msg).catch(() => {});
  };

  client.sendChat = (msg) => {
    if (statusChannel) statusChannel.send(msg).catch(() => {});
  };

  await client.login(process.env.DISCORD_TOKEN);
  return client;
}

module.exports = { createDiscordBot };
