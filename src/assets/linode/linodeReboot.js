import fetchJSON from "@/assets/common/fetchJSON";
import linodeWaitReady from "@/assets/linode/linodeWaitReady";

export default async function linodeReboot(secretKey, linodeId) {
	if (!secretKey) {
		throw new Error(
			`linodeReboot(secretKey, linodeId) :: Expected a secret key`,
		);
	}
	if (!linodeId) {
		throw new Error(
			`linodeReboot(secretKey, linodeId) :: Expected a linode ID`,
		);
	}

	// Wait if not ready
	await linodeWaitReady(secretKey, linodeId);

	// Do action
	const reply = await fetchJSON(
		`https://api.linode.com/v4/linode/instances/${linodeId}/reboot`,
		{},
		{
			headers: {
				Authorization: `Bearer ${secretKey}`,
			},
		},
	);
	if (reply.ok) {
		await linodeWaitReady(secretKey, linodeId);
	} else {
		console.log(`linodeReboot(`, linodeId, `) ::`, reply.json?.errors);

		const json = reply.json.errors[0];
		const error = new Error(json.reason);
		error.json = json;
		throw error;
	}
}
