import {
	PLAN_SHARED_1C_1GB,
	PLAN_SHARED_1C_2GB,
	PLAN_SHARED_2C_4GB,
	PLAN_DEDICATED_2C_4GB,
	PLAN_DEDICATED_4C_8GB,
	PLAN_DEDICATED_8C_16GB,
	PLAN_DEDICATED_16C_32GB,
} from "./enumLinodePlans";

export default function getLinodePlanLabel(type) {
	switch (type) {
		case PLAN_SHARED_1C_1GB:
			return `Shared, 1 CPU, 1 GB RAM`;
		case PLAN_SHARED_1C_2GB:
			return `Shared, 1 CPU, 2 GB RAM`;
		case PLAN_SHARED_2C_4GB:
			return `Shared, 2 CPU, 4 GB RAM`;
		case PLAN_DEDICATED_2C_4GB:
			return `Dedicated, 2 CPUs, 4 GB RAM`;
		case PLAN_DEDICATED_4C_8GB:
			return `Dedicated, 4 CPUs, 8 GB RAM`;
		case PLAN_DEDICATED_8C_16GB:
			return `Dedicated, 8 CPUs, 16 GB RAM`;
		case PLAN_DEDICATED_16C_32GB:
			return `Dedicated, 16 CPUs, 32 GB RAM`;
		default:
			return type;
	}
}
