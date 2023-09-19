import discordApp from "@/assets/discord/discordApp";

let firstRun = true;

export default async function handler(req, res) {
	if (firstRun) {
		firstRun = false;

		console.log(` ℹ️ `, `Starting up Discord services`);
		await discordApp();
		console.log(` ℹ️ `, `Discord services are ready`);
	}

	res.statusCode = 200;
	res.setHeader("Content-Type", "text/plain");
	res.end("ok");
}
