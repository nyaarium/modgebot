import loadEnvJson from "@/assets/common/loadEnvJson";
import pause from "@/assets/common/pause";
import purgeOld from "@/assets/discord/commands/purgeOld";
import { Client } from "discord.js";

let channelConfigs = null;

export default async function servicePurgeOld(client = new Client()) {
	channelConfigs = loadEnvJson("CONFIG_PURGE_CHANNELS");

	executePurgeOld(client, true);
}

let timeoutExecute = null;
async function executePurgeOld(client = new Client(), first = false) {
	const WAIT_TIME = 24 * 60 * 60 * 1000;
	clearTimeout(timeoutExecute);
	timeoutExecute = setTimeout(
		async () => {
			for (const config of channelConfigs) {
				await purgeOld(client, config);
				await pause(10000);
			}

			executePurgeOld(client);
		},
		first ? 30000 : WAIT_TIME,
	);
}
