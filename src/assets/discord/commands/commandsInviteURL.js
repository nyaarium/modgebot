import getEnv from "@/assets/server/getEnv";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

const commandInviteURL = new SlashCommandBuilder()
	.setName(`invite-url`)
	.setDescription(`Show Eve bot invite URL.`)
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

const commandsInviteURL = [
	{
		data: commandInviteURL.toJSON(),
		async execute(client, interaction) {
			await interaction.editReply({
				content: getEnv("DISCORD_INVITE_URL"),
			});
		},
	},
];

export default commandsInviteURL;
