export default function cleanStack(stack) {
	stack = stack.replace(/^.*\s*/, "");
	stack = stack.replace(/\s*\(.*\)\s*/g, "\n");
	return stack;
}
