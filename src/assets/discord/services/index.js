import serviceGameServerMonitor from "@/assets/discord/services/serviceGameServerMonitor";
import servicePurgeOld from "@/assets/discord/services/servicePurgeOld";
import { Client } from "discord.js";

const DEV = process.env.NODE_ENV !== "production";

export default async function services(client = new Client()) {
	if (!DEV) {
		return Promise.all([
			servicePurgeOld(client),
			serviceGameServerMonitor(client),
		]);
	}
}
