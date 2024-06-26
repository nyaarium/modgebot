import { ExpiringCacheMap } from "@/assets/common/ExpiringCacheMap";
import pause from "@/assets/common/pause";
import getEnv from "@/assets/server/getEnv";
import { DMChannel } from "discord.js";
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

/**
 * @typedef {Object} GPTMessage
 * @property {string} role
 * @property {string} content
 * @property {string?} tool_call_id Tool call ID
 * @property {string?} name Tool call name
 *
 * @typedef {Object} UserMessage
 * @property {string} messageId
 * @property {string} timestamp
 * @property {string} content
 * @property {unknown[]} attachments
 * @property {string} userId
 * @property {string} tag
 * @property {string} username
 * @property {string} discriminator
 *
 * @typedef {Object} UserDMs
 * @property {function(): {
 * 		summary: string,
 * 		allMessages: UserMessage[],
 * 		unsumarizedMessages: UserMessage[],
 * 		undigestedMessages: UserMessage[],
 * 		lock: boolean,
 * 		allowed: boolean,
 * 		useCount: number,
 * }} get  Keep total token sizes below 3000 tokens: summary=1500 + latestMessageStrings=1500
 */
/**
 * Cache of user direct messages
 *
 * @type {UserDMs}
 */
const cacheUserDMs = new ExpiringCacheMap({
	ttl: ONE_DAY,
});

const toolExampleGetWeather = {
	type: "function",
	function: {
		name: "example_get_n_day_weather_forecast",
		description:
			"Example get an N-day weather forecast (make up numbers and weathers)",
		parameters: {
			type: "object",
			properties: {
				location: {
					type: "string",
					description: "The city and state, e.g. San Francisco, CA",
				},
				format: {
					type: "string",
					enum: ["celsius", "fahrenheit"],
					description:
						"The temperature unit to use. Infer this from the users location.",
				},
				num_days: {
					type: "integer",
					description: "The number of days to forecast",
				},
			},
			required: ["location", "format", "num_days"],
		},
	},
};

export async function handlerMessageCreate(discordMessage) {
	if (!(discordMessage.channel instanceof DMChannel)) return;

	const author = discordMessage.author;
	const content = discordMessage.content;
	const botUser = discordMessage.client.user;
	const botTag = `${botUser.username}#${botUser.discriminator}`;
	if (author.bot || author.system) return;

	console.log(`<${author.tag}> ${content}`);

	// Digest message (or queue for digestion)
	await digestMessages(discordMessage);

	const userDMs = cacheUserDMs.get(author.id);

	// Skip if locked
	if (userDMs.lock) return;

	// Check if allowed
	if (!userDMs.allowed) {
		// Recheck if allowed
		await checkUserAllowed(discordMessage, userDMs);
		if (!userDMs.allowed) {
			await discordMessage.react("❌");
			cacheUserDMs.delete(author.id);
			return;
		}
	}

	// Concat summary and unsummarized messages
	let messagesConcat =
		`==== Messages ====\n\n` +
		userDMs.unsumarizedMessages
			.map(
				(userMessage) =>
					`(${moment(userMessage.timestamp).fromNow()}) <@${
						userMessage.tag
					}> ${userMessage.content}`,
			)
			.join("\n\n---\n\n");
	if (userDMs.summary) {
		messagesConcat =
			`==== Summary of History ====\n\n` +
			`${userDMs.summary}\n\n\n\n======\n\n${messagesConcat}`;
	}

	console.log(`handlerMessageCreate() : runOpenAI()`);

	const replyMessage = await runOpenAI(
		[
			{
				role: "system",
				content: `You are <@${botTag}> having a lovely conversation with <@${author.tag}>. Read the following chat history, and respond with 1 message. Don't prefix the timestamp nor your name header.`,
			},
			{
				role: "system",
				content:
					`The following is a summary of the chat history:\n\n` +
					messagesConcat,
			},
		],
		[toolExampleGetWeather],
	);

	// Reply to user with message
	const replyDiscordMessage = await discordMessage.author.send(replyMessage);

	// And put it back into cache
	const replyUserMessage = convertDiscordToUserMessage(replyDiscordMessage);
	userDMs.undigestedMessages.push(replyUserMessage);

	userDMs.useCount++;
}

async function digestMessages(discordMessage) {
	const botUser = discordMessage.client.user;
	const botTag = `${botUser.username}#${botUser.discriminator}`;
	const author = discordMessage.author;
	const newUserMessage = convertDiscordToUserMessage(discordMessage);

	// Get DMs
	let userDMs = cacheUserDMs.get(author.id);

	try {
		// Initialize if not exists
		if (userDMs) {
			userDMs.undigestedMessages.push(newUserMessage);

			if (userDMs.lock) return;

			userDMs.lock = true;
		} else {
			userDMs = {
				summary: "",
				allMessages: [],
				unsumarizedMessages: [],
				undigestedMessages: [],
				lock: false,
				allowed: false,
				useCount: 0,
			};
			cacheUserDMs.set(author.id, userDMs);

			userDMs.lock = true;

			console.log(
				`digestMessages() : Getting first time history - getDMHistory()`,
			);
			await getDMHistory(author);
		}

		while (userDMs.undigestedMessages.length) {
			const userMessage = userDMs.undigestedMessages.shift();
			const fromNow = moment(userMessage.timestamp).fromNow();

			userDMs.allMessages.push(userMessage);

			// Check token length of unsumarizedMessages + message
			const tokenLengthUnsumarized = userDMs.unsumarizedMessages.reduce(
				(acc, message) => acc + tokenLength(message.content),
				0,
			);
			const tokenLengthNewMessage = tokenLength(newUserMessage.content);
			const totalUnsumarized =
				tokenLengthUnsumarized + tokenLengthNewMessage;

			let checkSummary = false;

			if (1500 < totalUnsumarized) {
				// Summarize
				const messages = userDMs.unsumarizedMessages.map(
					(message) =>
						`(${fromNow}) <@${message.tag}> ${message.content}`,
				);
				messages.push(
					`(${fromNow}) <@${author.tag}> ${newUserMessage.content}`,
				);

				console.log(`digestMessages() : Summarizing - runOpenAI() 1`);

				const nextSummary = await runOpenAI([
					{
						role: "system",
						content: `You are <@${botTag}>. Summarize from your first person perspective as ${botTag}. Read the following series of messages and provide a consise bullet-point summary that captures the main points and important details. Be sure to consider the time and context between messages, but do not mention the timestamps in your summary.`,
					},
					{
						role: "user",
						content: messages.join("\n\n---\n\n"),
					},
				]);

				if (userDMs.summary) {
					userDMs.summary += "\n\n---\n\n" + nextSummary;
					checkSummary = true;
				} else {
					userDMs.summary = nextSummary;
				}
			} else {
				userDMs.unsumarizedMessages.push(userMessage);
			}

			if (checkSummary) {
				console.log(`digestMessages() : Summarizing - runOpenAI() 2`);

				const nextSummary = await runOpenAI([
					{
						role: "system",
						content: `You are <@${botTag}>. Summarize from your first person perspective as ${botTag}. Read the following series of bullet-point summaries and provide a new consise bullet-point summary that captures the main points and important details. Be sure to add, combine, or remove any redundant information.`,
					},
					{
						role: "user",
						content: userDMs.summary,
					},
				]);

				userDMs.summary = nextSummary;
			}
		}

		userDMs.lock = false;
	} catch (error) {
		userDMs.lock = false;
		throw error;
	}
}

async function getDMHistory(author) {
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
			userMessages.unshift(convertDiscordToUserMessage(message));
		}

		lastId = fetched.last().id;

		await pause(1000);
	}

	const userDMs = cacheUserDMs.get(author.id);
	userDMs.undigestedMessages = userMessages;
}

async function checkUserAllowed(discordMessage, userDMs) {
	if (userDMs.allowed) return true;

	// If bot has responded at least once anywhere, return true
	const botUser = discordMessage.client.user;
	const botTag = `${botUser.username}#${botUser.discriminator}`;
	if (userDMs.allMessages) {
		for (const message of userDMs.allMessages) {
			if (message.tag === botTag) {
				userDMs.allowed = true;
				return true;
			}
		}
	}

	return false;
}

/**
 * Runs OpenAI. Tool call results will trigger another OpenAI call.
 *
 * @param {GPTMessage[]} gptMessages
 * @param {Object[]} tools
 *
 * @returns {Promise<string>}
 */
async function runOpenAI(gptMessages, tools = undefined) {
	console.log(`runOpenAI() : runOpenAI 1`);

	// 1st OpenAI run
	let res = await runOpenAIOnce(gptMessages, tools);

	if (res.tool_calls) {
		const nextGptMessages = [...gptMessages];

		nextGptMessages.push({
			role: "assistant",
			content: "",
			tool_calls: res.tool_calls,
		});

		for (const tool of res.tool_calls) {
			const name = tool.function.name;
			const props = tool.function.arguments;

			nextGptMessages.push({
				role: "tool",
				name,
				content: props,
				tool_call_id: tool.id,
			});
		}

		console.log(`runOpenAI() : runOpenAI 2`);

		// 2nd OpenAI run
		res = await runOpenAIOnce(nextGptMessages);
	}

	return res.content;
}

/**
 * Run OpenAI once.
 *
 * @param {GPTMessage[]} gptMessages
 * @param {Object[]} tools
 *
 * @returns {Promise<{content: string | null, tool_calls: unknown[] | null}>}
 */
async function runOpenAIOnce(gptMessages, tools = undefined) {
	const completion = await openai.chat.completions.create({
		model: MODEL_STANDARD,
		max_tokens: 4096,
		messages: gptMessages,
		tools,
	});

	const choices = completion.choices;
	const choice = choices[0];

	if (choice.message.tool_calls) {
		return {
			content: null,
			tool_calls: choice.message.tool_calls,
		};
	} else {
		return {
			content: choice.message.content.trim(),
			tool_calls: null,
		};
	}
}

/**
 * Convert Discord message to UserMessage
 *
 * @param {import("discord.js").Message} discordMessage
 * @returns {UserMessage}
 */
function convertDiscordToUserMessage(discordMessage) {
	return {
		messageId: discordMessage.id,
		timestamp: discordMessage.createdTimestamp,
		content: discordMessage.content,
		attachments: [...discordMessage.attachments.values()],

		userId: discordMessage.author.id,
		tag: discordMessage.author.bot
			? `${discordMessage.author.username}#${discordMessage.author.discriminator}`
			: discordMessage.author.username,
		username: discordMessage.author.username,
		discriminator: discordMessage.author.discriminator,
	};
}

function tokenLength(text) {
	// Rule of thumb: 1 token ≈ 4 characters
	return Math.ceil(text.length / 4);
}
