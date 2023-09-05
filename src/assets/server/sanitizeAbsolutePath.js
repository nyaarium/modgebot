import sanitizeRelativePath from "@/assets/server/sanitizeRelativePath";
import path from "path";

export default function sanitizeAbsolutePath(routePath) {
	return path.sep + sanitizeRelativePath(routePath);
}
