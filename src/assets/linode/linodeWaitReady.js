import pause from "@/assets/common/pause";
import {
	STATUS_BOOTING,
	STATUS_CLONING,
	STATUS_DELETING,
	STATUS_MIGRATING,
	// STATUS_OFFLINE, // Done
	STATUS_PROVISIONING,
	STATUS_REBOOTING,
	STATUS_REBUILDING,
	STATUS_RESIZING,
	STATUS_RESTORING,
	// STATUS_RUNNING, // Done
	STATUS_SHUTTING_DOWN,
} from "@/assets/linode/enumLinodeStatuses";
import linodeStatus from "@/assets/linode/linodeStatus";

export default async function linodeWaitReady(secretKey, linodeId) {
	if (!secretKey) {
		throw new Error(
			`linodeWaitReady(secretKey, linodeId) :: Expected an access key`,
		);
	}
	if (!linodeId) {
		throw new Error(
			`linodeWaitReady(secretKey, linodeId) :: Expected a linode ID`,
		);
	}

	// Check if busy
	let res;
	let done = false;
	while (!done) {
		res = await linodeStatus(secretKey, linodeId);
		switch (res.status) {
			case STATUS_BOOTING:
			case STATUS_REBOOTING:
			case STATUS_SHUTTING_DOWN:
			case STATUS_PROVISIONING:
			case STATUS_DELETING:
			case STATUS_MIGRATING:
			case STATUS_REBUILDING:
			case STATUS_CLONING:
			case STATUS_RESIZING:
			case STATUS_RESTORING:
				console.log(
					`linodeWaitReady(${linodeId}) :: Linode ${res.status}`,
				);
				await pause(10000);
				break;
			default:
				done = true;
		}
	}
	return res;
}
