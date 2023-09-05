import fs from "fs";
import path from "path";

// BASE will be excluded from the returns.
// Scan will take place in "BASE/pathArr"

// TODO:
// - Double check for security issues with lines: 22, 29, 32

export default function scanDirectory(BASE, pathArr = []) {
	const retFiles = [];
	const retDirs = [];

	if (!Array.isArray(BASE)) {
		if (typeof BASE === "string") {
			BASE = [BASE];
		} else {
			throw new Error(`scanDirectory() :: Expected a base path`);
		}
	}

	if (!fs.existsSync(path.join(...BASE, ...pathArr))) {
		return {
			dirs: [],
			files: [],
		};
	}

	const files = fs.readdirSync(path.join(...BASE, ...pathArr));
	for (const filename of files) {
		const pathStr = path.join(...BASE, ...pathArr, filename);
		const isDir = fs.lstatSync(pathStr).isDirectory();
		if (isDir) {
			retDirs.push([...pathArr, filename].join("/"));
		} else {
			retFiles.push([...pathArr, filename].join("/"));
		}
	}

	return {
		dirs: retDirs,
		files: retFiles,
	};
}
