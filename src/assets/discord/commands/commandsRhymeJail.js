import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

const commandRhymeJail = new SlashCommandBuilder()
	.setName(`rhyme-jail`)
	.setDescription(`Put a user in Rhyme Jail for 10 minutes.`)
	.setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
	.addUserOption((option) =>
		option
			.setName(`user`)
			.setDescription(`The user to put in Rhyme Jail.`)
			.setRequired(true),
	);

const commandsRhymeJail = [
	{
		data: commandRhymeJail.toJSON(),
		async execute(client, interaction) {
			// return
		},
	},
];

export default commandsRhymeJail;
