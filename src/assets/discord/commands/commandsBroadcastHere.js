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
			const channel = interaction.channel;

			const message = interaction.options.get(`message`);

			// Post message to channel
			await channel.send({
				content: message.value,
			});

			// Remove original message
			await interaction.deleteReply();
		},
	},
];

export default commandsBroadcastHere;
