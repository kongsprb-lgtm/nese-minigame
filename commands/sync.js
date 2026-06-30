const { SlashCommandBuilder } = require('discord.js');
const PendingSync = require('../models/PendingSync');
const User = require('../models/User');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Synchronize your profile with your Roblox account using a code')
    .addStringOption(option =>
      option.setName('code')
        .setDescription('The 6-character synchronization code generated in-game')
        .setRequired(true)
        .setMinLength(6)
        .setMaxLength(6)
    ),
  async execute(interaction) {
    // Acknowledge interaction quickly
    await interaction.deferReply({ ephemeral: true });

    const code = interaction.options.getString('code').trim().toUpperCase();
    const discordId = interaction.user.id;

    try {
      // Find the pending synchronization code
      const pendingSync = await PendingSync.findOne({ code });

      if (!pendingSync) {
        return await interaction.editReply({
          content: '❌ Invalid or expired synchronization code. Please generate a new code in-game and try again.'
        });
      }

      const { robloxId, username } = pendingSync;

      // Check if this Roblox ID is already synchronized to another Discord account
      const robloxSyncedUser = await User.findOne({ robloxId, discordId: { $ne: null, $ne: discordId }, linked: true });
      if (robloxSyncedUser) {
        return await interaction.editReply({
          content: `❌ The Roblox account **${username}** (${robloxId}) is already synchronized to another profile. If this is an error, please contact an administrator.`
        });
      }

      // Check database state to synchronize the accounts safely
      const discordUser = await User.findOne({ discordId });
      const robloxUser = await User.findOne({ robloxId });

      if (discordUser && robloxUser) {
        if (discordUser.id === robloxUser.id) {
          // They are the same document
          robloxUser.username = username;
          robloxUser.linked = true;
          await robloxUser.save();
        } else {
          // Merge accounts: Merge points & inventory, keep Roblox document as primary
          robloxUser.discordId = discordId;
          robloxUser.username = username;
          robloxUser.linked = true;
          robloxUser.points += discordUser.points;
          
          // Append inventory items safely
          if (discordUser.inventory && discordUser.inventory.length > 0) {
            robloxUser.inventory.push(...discordUser.inventory);
          }
          
          await robloxUser.save();
          await User.deleteOne({ _id: discordUser._id });
          logger.info(`Merged Discord User ${discordId} and Roblox User ${robloxId} during sync.`);
        }
      } else if (discordUser) {
        // Discord user document exists (without robloxId), sync Roblox ID to it
        discordUser.robloxId = robloxId;
        discordUser.username = username;
        discordUser.linked = true;
        await discordUser.save();
      } else if (robloxUser) {
        // Roblox user document exists, sync Discord ID to it
        robloxUser.discordId = discordId;
        robloxUser.username = username;
        robloxUser.linked = true;
        await robloxUser.save();
      } else {
        // Neither exists, create a new synchronized user
        await User.create({
          discordId,
          robloxId,
          username,
          linked: true
        });
      }

      // Delete the pending synchronization code so it cannot be reused
      await PendingSync.deleteOne({ _id: pendingSync._id });

      logger.info(`Successfully synchronized Discord ${discordId} to Roblox ${robloxId} (${username})`);
      
      return await interaction.editReply({
        content: `✅ **Success!** Your profile has been synchronized with Roblox account **${username}** (ID: ${robloxId}).`
      });
    } catch (error) {
      logger.error(`Error in sync command execution: ${error.message}`);
      return await interaction.editReply({
        content: '❌ An error occurred while processing your request. Please try again later.'
      });
    }
  }
};
