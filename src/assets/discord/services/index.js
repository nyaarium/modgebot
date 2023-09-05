import serviceGameServerMonitor from "@/assets/discord/services/serviceGameServerMonitor";
import servicePurgeOld from "@/assets/discord/services/servicePurgeOld";
import { Client } from "discord.js";

export default async function services(client = new Client()) {
	return Promise.all([
		servicePurgeOld(client),
		serviceGameServerMonitor(client),
	]);
}
