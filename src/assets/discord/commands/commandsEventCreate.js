import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

const commandCreateEvent = new SlashCommandBuilder()
	.setName(`create-event`)
	.setDescription(`Chat with an assistant that can answer many questions.`)
	.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
	.addStringOption((option) =>
		option
			.setName("message")
			.setRequired(true)
			.setDescription("Ask a question. I can answer many questions."),
	);

const commandsEventCreate = [
	{
		data: commandCreateEvent.toJSON(),
		async execute(client, interaction) {
			// return
		},
	},
];

export default commandsEventCreate;

// TODO: Might not be needed anymore, with the new channel status.
//       A create event command, with a couple of presets for MeatyHook and games.
