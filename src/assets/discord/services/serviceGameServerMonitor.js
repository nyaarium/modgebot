import { fetchJson } from "@/assets/common/fetchJson";
import pause from "@/assets/common/pause";
import getChannel from "@/assets/discord/getChannel";
import {
	STATUS_OFFLINE,
	STATUS_RUNNING,
} from "@/assets/linode/enumLinodeStatuses";
import getLinodePlanLabel from "@/assets/linode/getLinodePlanLabel";
import linodeBoot from "@/assets/linode/linodeBoot";
import linodeReboot from "@/assets/linode/linodeReboot";
import linodeResize from "@/assets/linode/linodeResize";
import linodeShutdown from "@/assets/linode/linodeShutdown";
import linodeStatus from "@/assets/linode/linodeStatus";
import getEnv from "@/assets/server/getEnv";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	Client,
	EmbedBuilder,
} from "discord.js";
import _ from "lodash";
import moment from "moment-timezone";

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID?.trim?.();

const SERVICE_ID = "appServers";

let appServers = null;
let userNyaarium = null;

const actionInProgress = {};

export default async function serviceGameServerMonitor(client = new Client()) {
	// Load app servers config
	appServers = getEnv("configAppServers.json5");

	if (!appServers) {
		console.log(`No appServers found. Skipping.`);
		return;
	}

	// Load templated server actions
	for (const [appId, server] of Object.entries(appServers)) {
		if (typeof server.actions === "string") {
			switch (server.actions) {
				case "linode-actions":
					server.actions = makeLinodeActions(server, appId);
					break;
				default:
					console.log(
						`⚠️ `,
						`Unhandled actions type: ${server.actions}`,
					);
			}
		}
	}

	// Disable invalid configurations & initialize posts
	for (const [appId, server] of Object.entries(appServers)) {
		if (!server.title) {
			console.log(`[${appId}] Missing title. Skipping.`);
			server.disabled = true;
			continue;
		}

		if (!server.broadcastChannels) {
			console.log(`[${appId}] Missing broadcastChannels. Skipping.`);
			server.disabled = true;
			continue;
		}

		for (const broadcastChannel of server.broadcastChannels) {
			const { guildId, channelName, channelId } = broadcastChannel;

			if (broadcastChannel.disabled) continue;

			if (!guildId) {
				console.log(
					`[${appId}] Broadcast channel missing guildId. Skipping.`,
				);
				broadcastChannel.disabled = true;
				continue;
			}

			if (!channelName && !channelId) {
				console.log(
					`[${appId}] Broadcast channel missing channelName & channelId. Skipping.`,
				);
				broadcastChannel.disabled = true;
				continue;
			}

			await initializePost(client, appId, server, broadcastChannel);
		}
	}

	// Fetch all server polls
	await Promise.all(
		_.map(appServers, async (server, appId) => {
			if (shouldSkipApp(server)) return;

			await pollServer(server, appId);
		}),
	);

	// No errors. Start the forever polling loop
	pollServers(client);
}

export async function dispatchAction(client, interaction, options) {
	if (!options.guildId) throw new Error(`Expected option guildId.`);
	if (!options.channelId) throw new Error(`Expected option channelId.`);
	if (!options.customId) throw new Error(`Expected option customId.`);

	const dispatch = unKey(options.customId);

	if (dispatch.serviceId !== SERVICE_ID) return;

	console.log(
		`⚙️ Action dispatched:`,
		interaction.user.username,
		dispatch.appId,
		dispatch.actionId,
	);

	const server = appServers[dispatch.appId];

	try {
		// Block if already busy
		if (actionInProgress[dispatch.appId]) {
			console.log(`⚙️ Action in progress. Please wait.`);
			await interaction.reply({
				content: `Action in progress. Please wait.`,
				ephemeral: true,
			});
			return;
		}
		actionInProgress[dispatch.appId] = true;

		// Perform action and reply
		if (server.actions) {
			const actionConfig = server.actions[dispatch.actionId];
			const user = interaction.user;

			// Check if authorized
			if (typeof actionConfig.can === "function") {
				const permitted = await actionConfig.can.call(server, user);
				if (!permitted) {
					console.log(
						`⚙️ [${dispatch.appId}:${dispatch.actionId}] <${user.username}> Not on the server user list.`,
					);

					await dmMe(
						client,
						`[${dispatch.appId}:${dispatch.actionId}] <${user.tag}> Not on the user list.`,
					);

					actionInProgress[dispatch.appId] = false;
					return await interaction.reply({
						content: `[${dispatch.appId}:${dispatch.actionId}] Not on the user list.`,
						ephemeral: true,
					});
				}
			}

			// Double check if enabled
			if (await actionConfig.disabled.call(server)) {
				console.log(
					`⚙️ [${dispatch.appId}:${dispatch.actionId}] <${user.tag}> Action is not ready yet.`,
				);

				actionInProgress[dispatch.appId] = false;
				return await interaction.reply({
					content: `[${dispatch.appId}:${dispatch.actionId}] Action is not ready yet.`,
					ephemeral: true,
				});
			}

			// Disable action buttons while action in progress
			console.log(
				`⚙️ [${dispatch.appId}:${dispatch.actionId}] Disabling action buttons on posts.`,
			);
			await updateMessage(server, dispatch.appId);

			// Do action
			console.log(
				`⚙️ [${dispatch.appId}:${dispatch.actionId}] <${user.tag}> Action dispatched.`,
			);
			await interaction.reply({
				ephemeral: true,
				content: `[${dispatch.appId}:${dispatch.actionId}] Action dispatched.`,
			});

			try {
				console.log(
					`⚙️ [${dispatch.appId}:${dispatch.actionId}] Running action.`,
				);
				await actionConfig.action.call(server, client, interaction);

				await dmMe(
					client,
					`[${dispatch.appId}:${dispatch.actionId}] <${user.tag}> Action dispatched successfully.`,
				);
			} catch (error) {
				const reason =
					error?.json?.errors?.[0]?.reason ?? error.message;
				console.log(`⚙️ ⚠️ `, `Error occurred handling action.`);
				console.log(error);

				await interaction.followUp({
					ephemeral: true,
					content: `[${dispatch.appId}:${dispatch.actionId}] Error: ${reason}`,
				});

				await dmMe(
					client,
					`[${dispatch.appId}:${dispatch.actionId}] <${user.tag}> Error: ${reason}\n\`\`\`\n${error.stack}\n\`\`\``,
				);
			}

			actionInProgress[dispatch.appId] = false;

			// Enable action buttons
			console.log(
				`⚙️ [${dispatch.appId}:${dispatch.actionId}] Enabling action buttons.`,
			);
			await updateMessage(server, dispatch.appId);
		}
	} catch (error) {
		// Enable action buttons when errored
		actionInProgress[dispatch.appId] = false;

		console.log(`⚙️ ⚠️ `, `Error occurred handling action`);
		console.log(error);

		await interaction.reply({
			ephemeral: true,
			content: `[${dispatch.appId}:${dispatch.actionId}] Error occurred handling action.`,
		});

		await dmMe(
			client,
			`[${dispatch.appId}:${dispatch.actionId}] Error occurred handling action.\n\`\`\`\n${error.stack}\n\`\`\``,
		);
	}
}

async function dmMe(client, message) {
	if (!userNyaarium) {
		userNyaarium = await client.users.fetch("164550341604409344");
	}

	await userNyaarium.send(message);
}

async function initializePost(client, appId, server, broadcastChannel) {
	const { guildId, channelName, channelId, messageId } = broadcastChannel;

	const channel = await getChannel(client, guildId, channelName || channelId);
	if (!channel) {
		console.log(
			`[${appId}] Could not find channel "${
				channelName || channelId
			}". Skipping.`,
		);
		broadcastChannel.disabled = true;
		return;
	}

	let message = null;
	if (messageId) {
		message = await channel.messages.fetch(messageId);

		await message.edit({
			content: `**Server Information**`,
		});
	} else {
		switch (channel.type) {
			case ChannelType.AnnouncementThread:
				console.log(`[${appId}] Channel type: AnnouncementThread`);
				break;
			case ChannelType.GuildCategory:
				console.log(`[${appId}] Channel type: GuildCategory`);
				console.log(`I don't know what to do with this.`);
				break;
			case ChannelType.GuildDirectory:
				console.log(`[${appId}] Channel type: GuildDirectory`);
				console.log(`I don't know what to do with this.`);
				break;
			case ChannelType.PublicThread:
				console.log(`[${appId}] Channel type: PublicThread`);
				break;
			case ChannelType.PrivateThread:
				console.log(`[${appId}] Channel type: PrivateThread`);
				break;
			case 0:
				{
					console.log(`[${appId}] Channel type: TextChannel`);

					// TODO: find old message in the past 50.
					// xxx

					// If no recent is found, post a new one
					// server.channelId = channel.id;
					message = await channel.send({
						content: "**Server Information**",
					});
				}
				break;
			case 15: // New Enum for Forums
				{
					console.log(`[${appId}] Channel type: GuildForums`);

					const resThreads = await channel.threads.fetch();
					const threadChannels = resThreads.threads;

					let threadChannel = threadChannels.find(
						(thread) => thread.name === server.title,
					);

					if (!threadChannel) {
						threadChannel = await channel.threads.create({
							name: server.title,
							message: "**Server Information**",
						});
					}

					// await threadChannel.send({
					// 	content: `test posting in thread.`,
					// });

					if (threadChannel.ownerId == DISCORD_CLIENT_ID) {
						server.channelId = threadChannel.id;
						message = await threadChannel.messages.fetch(
							threadChannel.id,
						);
					}
				}
				break;
			default:
				console.log(`[${appId}] Channel type Unknown: ${channel.type}`);
		}
	}

	if (message) {
		broadcastChannel.message = message;
	} else {
		console.log(`[${appId}] Could not initialize post. Skipping.`);
		broadcastChannel.disabled = true;
	}
}

async function updateMessage(server, appId) {
	if (!server.broadcastChannels) return;

	for (const broadcastChannel of server.broadcastChannels) {
		const { message } = broadcastChannel;

		if (broadcastChannel.disabled) continue;

		if (!message) {
			console.log(
				`[${appId}] Weird. No message found after initializing it. Skipping.`,
			);
			broadcastChannel.disabled = true;
			continue;
		}

		const msg = {
			content: message.content,
			embeds: await makeEmbedCard(server),
			components: await makeActionsComponent(server, appId),
		};

		await message.edit(msg);
	}
}

function makeEmbedCard(server) {
	const embed = new EmbedBuilder();

	const desc = [];

	if (server.linode?.healthCheckRoute) {
		const lastCheck = server.lastCheck;
		if (lastCheck) {
			// Set description
			switch (lastCheck.status) {
				case STATUS_RUNNING: {
					let uptime = "";
					if (lastCheck.uptime) {
						uptime = `<t:${lastCheck.uptime}:R>`;
					}
					desc.push(
						`**${lastCheck.status.toUpperCase()}** ${uptime}`,
					);
					if (lastCheck?.info) {
						const info = infoRenderer(lastCheck.info);
						if (info) desc.push(info);
					}
					if (server.timestampAutoShutdown) {
						desc.push(
							`*Auto-shutdown <t:${server.timestampAutoShutdown}:R>*`,
						);
					}
					break;
				}
				case "starting":
					desc.push(
						`**${lastCheck.status.toUpperCase()}** <t:${
							server.lastChangeTimestamp
						}:R>`,
					);
					desc.push(`*Server application starting.*`);
					break;
				case "down":
					desc.push(
						`**${lastCheck.status.toUpperCase()}** <t:${
							server.lastChangeTimestamp
						}:R>`,
					);
					desc.push(
						`*Server application exited. Queued for shutdown.*`,
					);
					break;
				case "retired":
					desc.push(`**${lastCheck.status.toUpperCase()}**`);
					if (lastCheck?.info) {
						const info = infoRenderer(lastCheck.info);
						if (info) desc.push(info);
					}
					break;
				default:
					desc.push(
						`**${lastCheck.status.toUpperCase()}** <t:${
							server.lastChangeTimestamp
						}:R>`,
					);
					if (lastCheck?.info) {
						const info = infoRenderer(lastCheck.info);
						if (info) desc.push(info);
					}
			}

			desc.push("");

			// Set color & title
			switch (lastCheck.status) {
				case STATUS_RUNNING:
					embed.setColor(0x00ff00);
					embed.setTitle(`:white_check_mark: ${server.title}`);
					break;
				case STATUS_OFFLINE:
					embed.setColor(0x202020);
					embed.setTitle(`:zzz: ${server.title}`);
					break;
				case "down": // Custom application status
					embed.setColor(0x202020);
					embed.setTitle(`:hourglass: ${server.title}`);
					break;
				case "retired":
					embed.setColor(0x202020);
					embed.setTitle(`:x: ${server.title}`);
					break;
				default:
					embed.setColor(0xffff00);
					embed.setTitle(`:hourglass: ${server.title}`);
			}
		} else {
			embed.setTitle(`${server.title}`);
		}
	} else {
		embed.setTitle(`${server.title}`);
	}

	if (server.game) desc.push(`**${server.game}**`);
	if (server.modpack) desc.push(`**Modpack: ${server.modpack}**`);
	if (server.modpack && server.modpackDescription) {
		desc.push(`> ${server.modpackDescription.replace(/\n/gs, "\n> ")}`);
	}

	desc.push("");

	if (server.host) desc.push(`**Host:** \`${server.host}\``);
	if (server.port) desc.push(`**Port:** \`${server.port}\``);
	if (server.password) desc.push(`**Password:** \`${server.password}\``);

	if (server.description) desc.push(`\n${server.description.trim()}`);

	if (server.linode?.currentPlan) {
		desc.push("");

		desc.push(
			`**Current plan: ${getLinodePlanLabel(
				server.linode.currentPlan,
			)}**`,
		);

		if (server.linode.onlinePlan) {
			desc.push(
				`> \\* *when online:* ${getLinodePlanLabel(
					server.linode.onlinePlan,
				)}`,
			);
		}

		if (server.linode.offlinePlan) {
			desc.push(
				`> \\* *when offline:* ${getLinodePlanLabel(
					server.linode.offlinePlan,
				)}`,
			);
		}
	}

	embed.setDescription(desc.join("\n"));

	if (server.thumbnail) {
		embed.setThumbnail(server.thumbnail);
	}

	if (server.image) {
		embed.setImage(server.image);
	}

	return [embed];
}

async function makeActionsComponent(server, appId) {
	const components = [];

	const row = new ActionRowBuilder();
	components.push(row);

	for (const actionId in server.actions) {
		const action = server.actions[actionId];

		const customId = makeKey({
			serviceId: SERVICE_ID,
			appId,
			actionId,
		});

		if (await action?.hidden?.call?.(server)) {
			continue;
		}

		let disabled = false;
		if (actionInProgress[appId]) {
			disabled = true;
		} else if (action.disabled) {
			disabled = await action.disabled.call(server);
		}

		switch (action.type) {
			case "button":
				{
					row.addComponents(
						new ButtonBuilder()
							.setCustomId(customId)
							.setLabel(action.label)
							.setStyle(ButtonStyle.Primary)
							.setDisabled(disabled),
					);
				}
				break;
			case "select":
				{
					// const options = await action.options.call(server);
					// const builderOptions = options.map((option) => {
					// 	const optionBuilder =
					// 		new StringSelectMenuOptionBuilder()
					// 			.setLabel(option.label)
					// 			.setValue(option.value);
					//
					// 	if (option.description) {
					// 		optionBuilder.setDescription(option.description);
					// 	}
					//
					// 	return optionBuilder;
					// });
					// console.log(`=================`);
					// console.log(customId, action.label, disabled);
					// console.log(options);
					// console.log(builderOptions);
					// Output:
					// [
					// 	{
					// 		label: "8C 16GB",
					// 		description: "Dedicated, 8 CPUs, 16 GB RAM",
					// 		value: "g6-dedicated-8",
					// 	},
					// 	{
					// 		label: "16C 32GB",
					// 		description: "Dedicated, 16 CPUs, 32 GB RAM",
					// 		value: "g6-dedicated-16",
					// 	},
					// ];
					// [
					// 	StringSelectMenuOptionBuilder2 {
					// 		data: {
					// 			emoji: undefined,
					// 			label: "8C 16GB",
					// 			value: "g6-dedicated-8",
					// 			description: "Dedicated, 8 CPUs, 16 GB RAM",
					// 		},
					// 	},
					// 	StringSelectMenuOptionBuilder2 {
					// 		data: {
					// 			emoji: undefined,
					// 			label: "16C 32GB",
					// 			value: "g6-dedicated-16",
					// 			description: "Dedicated, 16 CPUs, 32 GB RAM",
					// 		},
					// 	},
					// ];
					// row.addComponents(
					// 	new StringSelectMenuBuilder()
					// 		.setCustomId(customId)
					// 		.setPlaceholder(action.label)
					// 		// .setStyle(ButtonStyle.Primary)
					// 		.addOptions(builderOptions)
					// 		.setDisabled(disabled),
					// );

					console.warn(
						`⚠️ `,
						`Unimplemented action type: ${action.type}`,
					);
				}
				break;
			default:
				throw new Error(`⚠️ `, `Unhandled action type: ${action.type}`);
		}
	}

	return components;
}

function makeKey(options) {
	if (!options.serviceId) throw new Error(`Expected option serviceId.`);
	if (!options.appId) throw new Error(`Expected option appId.`);
	if (!options.actionId) throw new Error(`Expected option actionId.`);

	return `${options.serviceId}::${options.appId}::${options.actionId}`;
}

function unKey(customId) {
	const params = customId.split("::");

	const serviceId = params[0];
	const appId = params[1];
	const actionId = params[2];

	if (!serviceId) throw new Error(`Expected option serviceId.`);
	if (!appId) throw new Error(`Expected option appId.`);
	if (!actionId) throw new Error(`Expected option actionId.`);

	return {
		serviceId,
		appId,
		actionId,
	};
}

async function pollServer(server, appId, postMessage = true) {
	if (shouldSkipApp(server)) return;

	if (server.migrationInProgress) return;

	let changed = false;
	let res = null;
	if (server.linode?.healthCheckRoute) {
		console.log(
			`[${appId}] Checking game server status: ${server.linode.healthCheckRoute}`,
		);
		try {
			const prHealthCheck = linodeHealthCheck(server);
			await Promise.race([
				prHealthCheck,
				pause(5000).then(() => Promise.reject(false)),
			]);

			try {
				const resHealthCheck = await prHealthCheck;
				if (resHealthCheck?.uptime) {
					res = resHealthCheck;
					console.log(`[${appId}] Result A - game uptime:`, res);
				} else {
					res = await linodeStatusCheck(server);
					console.log(`[${appId}] Result B - Linode status:`, res);
				}
			} catch (error) {
				// Linode should have responded. This is an unknown error.
				console.log(
					`  Result X - Linode error:`,
					error.status,
					error.message,
				);
			}
		} catch (_err) {
			// Health check timed out. Server is down.

			res = {
				status: "error",
				uptime: null,
				info: `Unknown error`,
			};

			// Check Linode, if configured
			if (server.linode?.id) {
				try {
					const resLinode = await linodeStatus(
						server.linode.key,
						server.linode.id,
					);
					server.linode.currentPlan = resLinode.type;

					if (!server.migrationInProgress) {
						switch (resLinode.status) {
							case STATUS_RUNNING:
								res = {
									status: "starting",
									uptime: null,
									info: `Starting server application`,
								};
								break;
							case STATUS_OFFLINE:
								res = {
									status: resLinode.status,
									uptime: null,
									info: `Linode server is off`,
								};
								break;
							default:
								res = {
									status: resLinode.status,
									uptime: null,
									info: `Linode server is busy`,
								};
						}
					}
				} catch (error) {
					switch (error?.json?.reason) {
						case "Not found":
							server.disabled = true;
							res = {
								status: "retired",
								uptime: null,
								info: `This server is permanently down.`,
							};
							break;

						default:
							console.log(
								`⚠️ `,
								`Linode error occurred checking server`,
							);

							console.log(appId, server, error);

							res = {
								status: "error",
								uptime: null,
								info: `Unknown Linode error`,
							};
					}
				}
			}

			console.log(`[${appId}] Result C - Linode down:`, res);
		}

		// Check if status changed since last run
		if (res?.status !== server.lastCheck?.status) {
			server.lastChangeTimestamp = moment().unix();
		}

		changed = !_.isEqual(res, server.lastCheck);
		server.lastCheck = res;

		if (changed && postMessage) {
			if (!server.broadcastChannels) return;

			for (const broadcastChannel of server.broadcastChannels) {
				const { message } = broadcastChannel;

				if (broadcastChannel.disabled) continue;

				if (!message) {
					console.log(
						`[${appId}] Weird. Could not find message after initializing it. Skipping.`,
					);
					broadcastChannel.disabled = true;
					continue;
				}

				await updateMessage(server, appId);
			}
		}
	}
}

let timeoutPoll = null;
async function pollServers(client) {
	const WAIT_TIME = 30 * 1000;
	clearTimeout(timeoutPoll);
	timeoutPoll = setTimeout(async () => {
		const checksPassed = {};

		for (const [appId, server] of Object.entries(appServers)) {
			if (shouldSkipApp(server)) continue;

			try {
				await pollServer(server, appId);
				checksPassed[appId] = true;
			} catch (error) {
				console.log(`⚠️ `, `Error occurred checking [${appId}]`);
				console.log(error);

				dmMe(
					client,
					`[${appId}] Error occurred checking server.\n\`\`\`\n${error.stack}\n\`\`\``,
				);
			}
		}

		// Auto-actions
		_.map(appServers, async (server, appId) => {
			if (!checksPassed[appId]) return;

			autoShutdownIfDown(server, appId);
			autoShutdownIfEmpty(server, appId);
		});

		pollServers(client, false);
	}, WAIT_TIME);
}

async function autoShutdownIfDown(server, appId) {
	if (shouldSkipApp(server)) return;

	const chk = () => {
		if (server.lastCheck.status !== "down") return false;
		if (!server.actions?.shutdown?.action) return false;
		return true;
	};

	if (chk()) {
		console.log(`[${appId}] Auto-shutting down "down" server.`);
		actionInProgress[appId] = true;
		const action = server.actions?.shutdown?.action;
		await action.call(server);
		actionInProgress[appId] = false;
	}
}

async function autoShutdownIfEmpty(server, appId) {
	if (shouldSkipApp(server)) return;

	const chk = () => {
		const lc = server?.lastCheck;
		if (typeof server.linode?.autoShutdown !== "number") return false;
		if (!server.actions?.shutdown?.action) return false;
		if (lc?.status !== STATUS_RUNNING) return false;
		if (typeof lc?.info?.players !== "number") return false;
		return lc?.info?.players === 0;
	};

	if (chk()) {
		if (!server.timeoutAutoShutdown) {
			console.log(`[${appId}] Queuing for 0-player shutdown.`);

			const mins = Math.max(10, server.linode?.autoShutdown);

			const WAIT_TIME = mins * 60 * 1000;
			server.timeoutAutoShutdown = setTimeout(async () => {
				console.log(`[${appId}] Auto-shutting down 0-player server.`);

				delete server.timestampAutoShutdown;
				delete server.timeoutAutoShutdown;

				actionInProgress[appId] = true;
				const action = server.actions?.shutdown?.action;
				await action.call(server);
				actionInProgress[appId] = false;
			}, WAIT_TIME);

			// Notify users
			server.timestampAutoShutdown = moment()
				.add(mins, "minutes")
				.subtract(1, "minutes") // pad 1 minute, since embeds update slowly
				.unix();

			await updateMessage(server, appId);
		}
	} else {
		if (server.timeoutAutoShutdown) {
			console.log(`[${appId}] Cleared from 0-player shutdown.`);

			clearTimeout(server.timeoutAutoShutdown);
			delete server.timestampAutoShutdown;
			delete server.timeoutAutoShutdown;

			await updateMessage(server, appId);
		}
	}
}

function shouldSkipApp(server) {
	if (!server) return true;
	if (server.disabled) return true;
	if (!server.broadcastChannels) return true;
	if (!server.channelId) return true;
	if (!server.title) return true;
	return false;
}

async function linodeHealthCheck(server) {
	return await fetchJson(server.linode.healthCheckRoute);
}

async function linodeStatusCheck(server) {
	const res = await linodeStatus(server.linode.key, server.linode.id);
	server.linode.currentPlan = res.type;

	return {
		status: res.status ?? "--",
		uptime: null,
		players: 0,
	};
}

function makeLinodeActions(server, appId) {
	const performResize = async function (key, id, plan) {
		const prResize = linodeResize(key, id, plan);

		this.lastCheck.status = "resizing";
		this.lastCheck.info = `Server is resizing`;
		this.lastChangeTimestamp = moment().unix();
		await updateMessage(server, appId);

		await prResize;

		await updateMessage(server, appId);
	};

	return {
		boot: {
			type: "button",
			label: "Boot",
			async action(client, interaction) {
				if (this.linode.onlinePlan) {
					this.migrationInProgress = true;
					try {
						await performResize.call(
							this,
							this.linode.key,
							this.linode.id,
							this.linode.onlinePlan,
						);
					} catch (error) {
						this.migrationInProgress = false;
						throw error;
					}
					this.migrationInProgress = false;
				}

				await linodeBoot(this.linode.key, this.linode.id);
			},
			async disabled() {
				return this.lastCheck.status !== STATUS_OFFLINE;
			},
			async can(user) {
				return user.id in this.linode.authorizedUsers;
			},
		},
		shutdown: {
			type: "button",
			label: "Shutdown",
			async action(client, interaction) {
				await linodeShutdown(this.linode.key, this.linode.id);

				this.migrationInProgress = true;
				try {
					if (this.linode.offlinePlan) {
						await performResize.call(
							this,
							this.linode.key,
							this.linode.id,
							this.linode.offlinePlan,
						);
					}
				} catch (error) {
					this.migrationInProgress = false;
					throw error;
				}
				this.migrationInProgress = false;
			},
			async disabled() {
				return (
					this.lastCheck.status != "starting" &&
					this.lastCheck.status != STATUS_RUNNING
				);
			},
			async can(user) {
				return user.id in this.linode.authorizedUsers;
				// return user.id == "164550341604409344";
			},
		},
		reboot: {
			type: "button",
			label: "Reboot",
			async action(client, interaction) {
				await linodeReboot(this.linode.key, this.linode.id);
			},
			async disabled() {
				return (
					this.lastCheck.status != "starting" &&
					this.lastCheck.status != STATUS_RUNNING
				);
			},
			async can(user) {
				return user.id in this.linode.authorizedUsers;
				// return user.id == "164550341604409344";
			},
		},
		/*
		setPlan: {
			type: "select",
			label: "Set Plan",
			async options(client, interaction) {
				return [
					{
						label: `8C 16GB`,
						description: getLinodePlanLabel(PLAN_DEDICATED_8C_16GB),
						value: PLAN_DEDICATED_8C_16GB,
					},
					{
						label: `16C 32GB`,
						description: getLinodePlanLabel(
							PLAN_DEDICATED_16C_32GB,
						),
						value: PLAN_DEDICATED_16C_32GB,
					},
				];
			},
			async action(client, interaction) {
				// TODO
				console.log(interaction);
			},
			async hidden() {
				if (!this.linode.onlinePlans) return true;
				return this.linode.onlinePlans <= 1;
			},
			async disabled() {
				return this.lastCheck.status !== STATUS_OFFLINE;
			},
			async can(user) {
				// return user.id in this.linode.authorizedUsers;
				return user.id == "164550341604409344";
			},
		},
		*/
	};
}

function infoRenderer(info) {
	if (typeof info === "string") return `*${info}*`;

	if (typeof info === "object") {
		return _.map(info, (value, key) => {
			switch (key) {
				case "players":
					return `*${value}* players online`;
				default:
					return `*${value}*`;
			}
		}).join(`\n`);
	}
}
