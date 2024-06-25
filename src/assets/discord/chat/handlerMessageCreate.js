import { ExpiringCacheMap } from "@/assets/common/ExpiringCacheMap";
import pause from "@/assets/common/pause";
import getEnv from "@/assets/server/getEnv";
import moment from "moment-timezone";
import OpenAI from "openai";

const OPENAI_KEY = getEnv("OPENAI_KEY")?.trim?.();
const DISCORD_CLIENT_ID = getEnv("DISCORD_CLIENT_ID")?.trim?.();
if (!OPENAI_KEY) {
	throw new Error("Missing OPENAI_KEY environment variable");
}
if (!DISCORD_CLIENT_ID) {
	throw new Error("Missing DISCORD_CLIENT_ID environment variable");
}

const openai = new OpenAI({
	apiKey: OPENAI_KEY,
});

const MODEL_STANDARD = "gpt-4o";

const ONE_DAY = 24 * 60 * 60 * 1000;

const cacheUserDMs = new ExpiringCacheMap({
	ttl: ONE_DAY,
});

export async function handlerMessageCreate(discordMessage) {
	const author = discordMessage.author;
	const content = discordMessage.content;

	if (author.bot || author.system) return;

	console.log(`<${author.tag}> ${content}`);

	if (cacheUserDMs.get(author.id)) {
		const userDMs = cacheUserDMs.get(author.id);
		const userMessages = userDMs.messages;
		userMessages.push(objectifyUserMessage(discordMessage));
	} else {
		await dmGetHistory(author);
	}

	const summary = await summarizeUserDMs(author);
	console.log(summary);
}

async function dmGetHistory(author) {
	const dmChannel = await author.createDM();

	const userMessages = [];
	let lastId = null;

	// Loop and get the last 1000 messages
	for (let i = 0; i < 10; i++) {
		const fetched = await dmChannel.messages.fetch({
			limit: 100,
			before: lastId,
		});

		if (fetched.size === 0) break;

		for (const message of fetched.values()) {
			// Prepare to the front
			userMessages.unshift(objectifyUserMessage(message));
		}

		lastId = fetched.last().id;

		await pause(1000);
	}

	cacheUserDMs.set(author.id, {
		messages: userMessages,
	});
}

async function summarizeUserDMs(author) {
	const userDMs = cacheUserDMs.get(author.id);
	const userMessages = userDMs.messages;
	const summary = userDMs.summary;

	if (summary) {
		return summary;
	} else {
		const messages = [];

		for (const userMessage of userMessages) {
			const fromNow = moment(userMessage.timestamp).fromNow();
			messages.push(
				`(${fromNow}) <${userMessage.tag}> ${userMessage.content}`,
			);
		}

		userDMs.summary = await runSummarizeMessages(messages);

		return userDMs.summary;
	}
}

async function runSummarizeMessages(messages) {
	// Chunks of messages, max CHUNK_SIZE tokens
	const chunks = chunkify(messages);

	if (chunks.length === 0) return "";

	const summaries = [];

	for (const chunk of chunks) {
		summaries.push(
			await runOpenAI([
				{
					role: "system",
					content: `You are an assistant that summarizes message history. Read the following series of messages and provide a concise summary that captures the main points and important details discussed. Be sure to consider the time and context between messages.`,
				},
				{
					role: "user",
					content: chunk,
				},
			]),
		);
	}

	// Combine summaries
	const chunksSummaryOfSummaries = chunkify(summaries);

	if (chunksSummaryOfSummaries.length === 1) {
		return chunksSummaryOfSummaries[0];
	} else {
		return await runOpenAI([
			{
				role: "system",
				content: `You are an assistant that condenses summaries. Read the following series of summaries and provide a concise summary that captures the main points and important details discussed. Be sure to combine or remove any redundant information.`,
			},
			{
				role: "user",
				content: summaries.join("\n"),
			},
		]);
	}
}

async function runOpenAI(gptMessages) {
	const completion = await openai.chat.completions.create({
		model: MODEL_STANDARD,
		max_tokens: 4096,
		messages: gptMessages,
	});

	const choices = completion.choices;
	const choice = choices[0];

	const text = choice.message.content.trim();
	return text;
}

function chunkify(messages) {
	const CHUNK_SIZE = 3500;

	// Chunks of messages, max CHUNK_SIZE tokens
	const chunks = [];

	let chunk = "";
	for (const message of messages) {
		const messageText = message;

		if (CHUNK_SIZE < chunk.length + messageText.length) {
			chunks.push(chunk.trim());
			chunk = "";
		}

		chunk += messageText + "\n\n\n";
	}

	if (chunk) {
		chunks.push(chunk.trim());
	}

	return chunks;
}

function objectifyUserMessage(discordMessage) {
	return {
		messageId: discordMessage.id,
		timestamp: discordMessage.createdTimestamp,
		content: discordMessage.content,
		attachments: [...discordMessage.attachments.values()],

		userId: discordMessage.author.id,
		tag: `${discordMessage.author.username}#${discordMessage.author.discriminator}`,
		username: discordMessage.author.username,
		discriminator: discordMessage.author.discriminator,
	};
}
