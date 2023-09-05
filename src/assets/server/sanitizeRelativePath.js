import path from "path";

export default function sanitizeRelativePath(routePath) {
	if (typeof routePath !== "string") {
		throw new Error(`Expected string`);
	}

	routePath = path.normalize(routePath);

	routePath = routePath.split(/[\\/]/);

	const ret = [];

	// Path cleanup
	for (let i = 0; i < routePath.length; i++) {
		let segment = routePath[i];

		try {
			segment = decodeURIComponent(segment).trim().replace(/[\\/]/g, "");
		} catch (error) {
			console.log(`Errored on path: ${routePath}`);
			console.log(`        Segment: ${segment}`);
			throw error;
		}

		if (segment === "." || segment === ".." || segment === "~") {
			// Not allowed to use these directory operators
			const error = new Error(`Forbidden route`);
			error.status = 403;
			throw error;
		}

		if (segment !== "") {
			ret.push(segment);
		}
	}

	return path.join(...ret);
}
