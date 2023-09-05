import fetchJSON from "@/assets/common/fetchJSON";
import { STATUS_OFFLINE } from "@/assets/linode/enumLinodeStatuses";
import linodeWaitReady from "@/assets/linode/linodeWaitReady";

export default async function linodeShutdown(secretKey, linodeId) {
	if (!secretKey) {
		throw new Error(
			`linodeShutdown(secretKey, linodeId) :: Expected an access key`,
		);
	}
	if (!linodeId) {
		throw new Error(
			`linodeShutdown(secretKey, linodeId) :: Expected a linode ID`,
		);
	}

	// Wait if not ready
	const res = await linodeWaitReady(secretKey, linodeId);
	if (res.status === STATUS_OFFLINE) return;

	// Do action
	const reply = await fetchJSON(
		`https://api.linode.com/v4/linode/instances/${linodeId}/shutdown`,
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
		console.log(`linodeShutdown(`, linodeId, `) ::`, reply.json?.errors);

		const json = reply.json.errors[0];
		const error = new Error(json.reason);
		error.json = json;
		throw error;
	}
}
