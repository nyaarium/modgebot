import { fetchJson } from "@/assets/common/fetchJson";

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

	const { label, status, type, region, specs } = await fetchJson(
		`https://api.linode.com/v4/linode/instances/${linodeId}`,
		undefined,
		{
			headers: {
				Authorization: `Bearer ${secretKey}`,
			},
			retry: 3,
		},
	);
	return { label, status, type, region, specs };
}
