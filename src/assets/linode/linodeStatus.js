import fetchJSON from "@/assets/common/fetchJSON";

export default async function linodeStatus(secretKey, linodeId) {
	if (!secretKey) {
		throw new Error(
			`linodeStatus(secretKey, linodeId) :: Expected an access key`,
		);
	}
	if (!linodeId) {
		throw new Error(
			`linodeStatus(secretKey, linodeId) :: Expected a linode ID`,
		);
	}

	const reply = await fetchJSON(
		`https://api.linode.com/v4/linode/instances/${linodeId}`,
		undefined,
		{
			headers: {
				Authorization: `Bearer ${secretKey}`,
			},
		},
	);
	if (reply.ok) {
		const { label, status, type, region, specs } = reply.json;
		return { label, status, type, region, specs };
	} else {
		console.log(`linodeStatus(`, linodeId, `) ::`, reply.json?.errors);

		const json = reply.json.errors[0];
		const error = new Error(json.reason);
		error.json = json;
		throw error;
	}
}
