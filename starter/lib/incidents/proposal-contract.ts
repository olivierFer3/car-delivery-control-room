/** Structural proposal arguments shared by the engine and provider output schema.
 * Current evidence, booking feasibility and authorization remain engine checks.
 */
export const proposalArgsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["optionId", "reservationId", "summary", "consequences", "evidenceIds"],
  properties: {
    optionId: { type: "string", minLength: 1, maxLength: 4000 },
    reservationId: { type: "string", minLength: 1, maxLength: 4000 },
    summary: { type: "string", minLength: 1, maxLength: 4000 },
    consequences: { type: "string", minLength: 1, maxLength: 4000 },
    evidenceIds: { type: "array", maxItems: 30, items: { type: "string", maxLength: 4000 } },
  },
}
