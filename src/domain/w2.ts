import { z } from "zod";
import { cents } from "./money.js";

const CentsSchema = z.number().int().finite().transform((value) => cents(value));

export const AddressSchema = z.object({
  street: z.string().min(1),
  apartment: z.string().optional(),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}(?:-\d{4})?$/)
});

export const CanonicalW2Schema = z.object({
  taxYear: z.literal(2025),
  employee: z.object({
    firstName: z.string().min(1),
    middleInitial: z.string().max(1).optional(),
    lastName: z.string().min(1),
    ssn: z.string().regex(/^\d{3}-\d{2}-\d{4}$/),
    address: AddressSchema
  }),
  employer: z.object({
    name: z.string().min(1),
    ein: z.string().optional(),
    address: AddressSchema.optional()
  }),
  boxes: z.object({
    box1WagesCents: CentsSchema,
    box2FederalWithholdingCents: CentsSchema,
    box3SocialSecurityWagesCents: CentsSchema.optional(),
    box4SocialSecurityTaxCents: CentsSchema.optional(),
    box5MedicareWagesCents: CentsSchema.optional(),
    box6MedicareTaxCents: CentsSchema.optional(),
    box12: z.array(z.object({ code: z.string(), amountCents: CentsSchema })),
    box13: z.object({
      statutoryEmployee: z.boolean(),
      retirementPlan: z.boolean(),
      thirdPartySickPay: z.boolean()
    }),
    stateRows: z.array(
      z.object({
        state: z.string().length(2),
        stateWagesCents: CentsSchema.optional(),
        stateWithholdingCents: CentsSchema.optional()
      })
    )
  }),
  extraction: z.object({
    multipleDistinctW2sDetected: z.boolean(),
    unreadableFields: z.array(z.string()),
    warnings: z.array(z.string()),
    confidenceByField: z.record(z.string(), z.number().min(0).max(1))
  })
});

export type CanonicalW2 = z.infer<typeof CanonicalW2Schema>;

export function sampleW2FromFixture(raw: unknown): CanonicalW2 {
  return CanonicalW2Schema.parse({
    ...(raw as Record<string, unknown>),
    extraction: {
      multipleDistinctW2sDetected: false,
      unreadableFields: [],
      warnings: [],
      confidenceByField: {}
    }
  });
}

export function sampleCanonicalW2(): CanonicalW2 {
  return {
    taxYear: 2025,
    employee: {
      firstName: "Avery",
      lastName: "Sample",
      ssn: "900-12-3456",
      address: {
        street: "125 Example Avenue",
        city: "Columbus",
        state: "OH",
        zip: "43215"
      }
    },
    employer: {
      name: "Example Bicycle Works, Inc.",
      ein: "00-1234567",
      address: {
        street: "480 Demo Plaza",
        city: "Columbus",
        state: "OH",
        zip: "43215"
      }
    },
    boxes: {
      box1WagesCents: cents(4_000_000),
      box2FederalWithholdingCents: cents(320_000),
      box3SocialSecurityWagesCents: cents(4_000_000),
      box4SocialSecurityTaxCents: cents(248_000),
      box5MedicareWagesCents: cents(4_000_000),
      box6MedicareTaxCents: cents(58_000),
      box12: [],
      box13: {
        statutoryEmployee: false,
        retirementPlan: false,
        thirdPartySickPay: false
      },
      stateRows: [{ state: "OH", stateWagesCents: cents(4_000_000), stateWithholdingCents: cents(120_000) }]
    },
    extraction: {
      multipleDistinctW2sDetected: false,
      unreadableFields: [],
      warnings: [],
      confidenceByField: {}
    }
  };
}
