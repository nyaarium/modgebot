import fetchJSON from "@/assets/common/fetchJSON";
import { STATUS_RUNNING } from "@/assets/linode/enumLinodeStatuses";
import linodeWaitReady from "@/assets/linode/linodeWaitReady";

export default async function linodeBoot(secretKey, linodeId) {
	if (!secretKey) {
		throw new Error(
			`linodeBoot(secretKey, linodeId) :: Expected a secret key`,
		);
	}
	if (!linodeId) {
		throw new Error(
			`linodeBoot(secretKey, linodeId) :: Expected a linode ID`,
		);
	}

	// Wait if not ready
	const res = await linodeWaitReady(secretKey, linodeId);
	if (res.status === STATUS_RUNNING) return;

	// Do action
	const reply = await fetchJSON(
		`https://api.linode.com/v4/linode/instances/${linodeId}/boot`,
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
		console.log(`linodeBoot(`, linodeId, `) ::`, reply.json?.errors);

		const json = reply.json.errors[0];
		const error = new Error(json.reason);
		error.json = json;
		throw error;
	}
}
