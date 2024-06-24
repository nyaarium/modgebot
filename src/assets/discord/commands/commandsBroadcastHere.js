import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

const commandBroadcastHere = new SlashCommandBuilder()
	.setName(`broadcast-here`)
	.setDescription(`Broadcast Here - Post a message here as Eve bot.`)
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
	.addStringOption((option) =>
		option
			.setName(`message`)
			.setDescription(`Message to post as Eve bot.`)
			.setRequired(true),
	);

const commandsBroadcastHere = [
	{
		data: commandBroadcastHere.toJSON(),
		async execute(client, interaction) {
			const message = interaction.options.get(`message`);

			// Edit interaction
			await interaction.editReply({
				content: message.value,
			});
		},
	},
];

export default commandsBroadcastHere;
