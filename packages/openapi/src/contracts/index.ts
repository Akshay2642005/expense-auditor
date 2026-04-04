import { initContract } from "@ts-rest/core";
import { healthContract } from "./health.js";
import { claimContract } from "./claim.js";
import { auditContract } from "./audit.js";
import { policyContract } from "./policy.js";
import { organizationContract } from "./organization.js";
const c = initContract();

export const apiContract = c.router({
  Health: healthContract,
  Claim: claimContract,
  Audit: auditContract,
  Policy: policyContract,
  Organization: organizationContract,
});
