import { fetchJson } from "@/assets/common/fetchJson";
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
	await fetchJson(
		`https://api.linode.com/v4/linode/instances/${linodeId}/boot`,
		{},
		{
			headers: {
				Authorization: `Bearer ${secretKey}`,
			},
		},
	);

	await linodeWaitReady(secretKey, linodeId);
}
