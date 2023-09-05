import createPromise from "@/assets/common/createPromise";
import commands from "@/assets/discord/commands";
import { register } from "@/assets/discord/register";
import services from "@/assets/discord/services";
import { dispatchAction } from "@/assets/discord/services/serviceGameServerMonitor";
import { Client, Events, GatewayIntentBits } from "discord.js";
import _ from "lodash";

export default async function discordApp() {
	const LINODE_KEY_NYAARIUM = process.env.LINODE_KEY_NYAARIUM?.trim?.();
	const OPENAI_KEY = process.env.OPENAI_KEY?.trim?.();
	const DISCORD_SECRET_KEY = process.env.DISCORD_SECRET_KEY?.trim?.();
	if (!LINODE_KEY_NYAARIUM) {
		throw new Error("Missing LINODE_KEY_NYAARIUM environment variable");
	}
	if (!OPENAI_KEY) {
		throw new Error("Missing OPENAI_KEY environment variable");
	}
	if (!DISCORD_SECRET_KEY) {
		throw new Error("Missing DISCORD_SECRET_KEY environment variable");
	}

	const pr = createPromise();

	const client = new Client({ intents: [GatewayIntentBits.Guilds] });

	const commandsMap = _.keyBy(commands, "data.name");

	client.on("ready", async () => {
		try {
			console.log(` ℹ️ `, `Logged in as ${client.user.tag}!`);

			await register();

			await services(client);

			pr.resolve();
		} catch (error) {
			console.log(`⛔ `, `Error starting modgebot services`);
			console.error(error);
			process.exit(1);
		}
	});

	client.on(Events.InteractionCreate, async (interaction) => {
		if (!interaction.isChatInputCommand()) return;

		const command = commandsMap[interaction.commandName];
		if (command) {
			if (command.execute) {
				console.log(
					`<${interaction.user.tag}> /${interaction.commandName}`,
				);

				try {
					await interaction.deferReply();

					await command.execute(client, interaction);
				} catch (error) {
					console.log(`⚠️ `, error);

					await interaction.editReply({
						ephemeral: true,
						content: `[${interaction.commandName}] ${error.message}\n\`\`\`${error.stack}\`\`\``,
					});
				}
			} else {
				await interaction.reply({
					ephemeral: true,
					content: `[${interaction.commandName}] Error: execute() function missing.`,
				});
			}
		}
	});

	client.on(Events.InteractionCreate, async (interaction) => {
		if (!interaction.isButton()) return;

		const { guildId, channelId, customId } = interaction;
		await dispatchAction(client, interaction, {
			serviceId: "appServers",
			guildId,
			channelId,
			customId,
		});
	});

	try {
		await client.login(DISCORD_SECRET_KEY);
	} catch (error) {
		console.log(`⛔ `, `Failed to log in to Discord client`);
		console.error(error);
		process.exit(1);
	}

	await pr.promise;
}
