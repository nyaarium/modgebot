import { removeDiacritics } from "@/assets/common/removeDiacritics";
import {
	AttachmentBuilder,
	escapeMarkdown,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import OpenAI from "openai";

const OPENAI_KEY = process.env.OPENAI_KEY?.trim?.();
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID?.trim?.();
if (!OPENAI_KEY) {
	throw new Error("Missing OPENAI_KEY environment variable");
}
if (!DISCORD_CLIENT_ID) {
	throw new Error("Missing DISCORD_CLIENT_ID environment variable");
}

const TTS_MODEL = "tts-1-hd";
const TTS_VOICE = `nova`;
const TTS_SPEED = 1.0;

const commandsOpenAi = [
	{
		data: new SlashCommandBuilder()
			.setName(`audio`)
			.setDescription(`Audio - TTS a message to audio file.`)
			.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
			.addStringOption((option) =>
				option
					.setName("message")
					.setRequired(true)
					.setDescription("Message to convert to TTS audio file."),
			)
			.toJSON(),
		execute: executeTTS,
	},
];

export default commandsOpenAi;

const openai = new OpenAI({
	apiKey: OPENAI_KEY,
});

async function executeTTS(client, interaction) {
	let message = interaction.options.get("message")?.value ?? "";

	// Cleanup message
	message = removeDiacritics(message).trim();

	const audioBuffer = await runOpenAI({
		message,
	});

	let content = ``;
	content += `> <@${interaction.user.id}>\n`;
	content += `> *${escapeMarkdown(message)}*\n`;
	await interaction.editReply({
		content,
		files: [new AttachmentBuilder(audioBuffer, { name: "Response.ogg" })],
	});
}

async function runOpenAI({
	model = TTS_MODEL,
	voice = TTS_VOICE,
	speed = TTS_SPEED,
	message,
}) {
	try {
		const audioSample = await openai.audio.speech.create({
			response_format: "opus",
			model,
			voice,
			speed,
			input: message,
		});

		return Buffer.from(await audioSample.arrayBuffer());
	} catch (error) {
		console.log(error);
		console.log(`========`);
		console.log(
			`  Status:`,
			error.status,
			`  Code:`,
			error.code,
			`  Type:`,
			error.type,
		);
		console.log(error.message);
		console.log(`========`);

		throw error;
	}
}
