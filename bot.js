const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const logger = require('./utils/logger');

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.commands = new Collection();

// Load commands from the commands directory
function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  
  if (!fs.existsSync(commandsPath)) {
    logger.warn('Commands directory does not exist.');
    return [];
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  const commandsList = [];

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
      const command = require(filePath);
      
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commandsList.push(command.data.toJSON());
        logger.debug(`Loaded command: ${command.data.name}`);
      } else {
        logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
      }
    } catch (err) {
      logger.error(`Error loading command ${file}: ${err.message}`);
    }
  }

  return commandsList;
}

// Deploy/Register Slash Commands with Discord
async function registerCommands(commands) {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token || token === 'your_discord_bot_token_here' || !clientId || clientId === 'your_discord_client_id_here') {
    logger.warn('Discord Bot credentials are not fully configured. Command deployment skipped.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    // Register commands globally
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands }
    );

    logger.info(`Successfully reloaded ${commands.length} application (/) commands globally.`);
  } catch (error) {
    logger.error(`Failed to register slash commands: ${error.message}`);
  }
}

// Handle Slash Command Interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    logger.warn(`No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    logger.error(`Error executing command ${interaction.commandName}: ${error.message}`);
    
    const replyOptions = { content: 'There was an error while executing this command!', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(replyOptions).catch(err => logger.error(`Failed to send fallback reply: ${err.message}`));
    } else {
      await interaction.reply(replyOptions).catch(err => logger.error(`Failed to send fallback reply: ${err.message}`));
    }
  }
});

client.once('ready', () => {
  logger.info(`Logged in and ready! Discord Bot User: ${client.user.tag}`);
});

async function startBot() {
  const token = process.env.DISCORD_TOKEN;

  if (!token || token === 'your_discord_bot_token_here') {
    logger.warn('Discord Bot Token is not set or has default placeholder value. Bot will not login.');
    return;
  }

  try {
    const loadedCommands = loadCommands();
    if (loadedCommands.length > 0) {
      await registerCommands(loadedCommands);
    }
    
    await client.login(token);
  } catch (error) {
    logger.error(`Failed to start Discord Bot: ${error.message}`);
  }
}

module.exports = { startBot, client };
