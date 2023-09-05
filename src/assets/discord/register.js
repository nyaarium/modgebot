import commands from "@/assets/discord/commands";
import { REST, Routes } from "discord.js";

export async function register() {
	const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID?.trim?.();
	const DISCORD_SECRET_KEY = process.env.DISCORD_SECRET_KEY?.trim?.();
	if (!DISCORD_CLIENT_ID) {
		throw new Error(`Missing DISCORD_CLIENT_ID environment variable`);
	}
	if (!DISCORD_SECRET_KEY) {
		throw new Error(`Missing DISCORD_SECRET_KEY environment variable`);
	}

	try {
		const rest = new REST({ version: "10" }).setToken(DISCORD_SECRET_KEY);

		const commandsIndex = commands.map((command) => {
			return command.data;
		});

		await rest.put(Routes.applicationCommands(DISCORD_CLIENT_ID), {
			body: commandsIndex,
		});

		console.log(` ℹ️ `, `Successfully reloaded application (/) commands.`);
	} catch (error) {
		console.log(`⛔ `, `Failed to register Discord commands`);
		console.error(error);
		process.exit(1);
	}
}
