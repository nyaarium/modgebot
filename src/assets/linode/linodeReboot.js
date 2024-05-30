import { fetchJson } from "@/assets/common/fetchJson";
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
	await fetchJson(
		`https://api.linode.com/v4/linode/instances/${linodeId}/reboot`,
		{},
		{
			headers: {
				Authorization: `Bearer ${secretKey}`,
			},
		},
	);

	await linodeWaitReady(secretKey, linodeId);
}
