import { extendZodWithOpenApi } from "@anatine/zod-openapi";
import { z } from "zod";

extendZodWithOpenApi(z);

export * from "./utils.js";
export * from "./health.js";
export * from "./claim.js";
export * from "./policy.js";
export * from "./audit.js";
