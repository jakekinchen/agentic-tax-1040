import { z } from "zod";

const MoneyString = z.string().regex(/^\d+(?:,\d{3})*(?:\.\d{1,2})?$|^\d+(?:\.\d{1,2})?$/);

export const ExtractedW2Schema = z.object({
  taxYear: z.number().int().nullable(),
  employee: z.object({
    firstName: z.string().nullable(),
    middleInitial: z.string().nullable(),
    lastName: z.string().nullable(),
    ssn: z.string().nullable(),
    address: z.object({
      street: z.string().nullable(),
      apartment: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      zip: z.string().nullable()
    }).strict()
  }).strict(),
  employer: z.object({
    name: z.string().nullable(),
    ein: z.string().nullable(),
    address: z.object({
      street: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      zip: z.string().nullable()
    }).nullable()
  }).strict(),
  boxes: z.object({
    box1Wages: MoneyString.nullable(),
    box2FederalWithholding: MoneyString.nullable(),
    box3SocialSecurityWages: MoneyString.nullable(),
    box4SocialSecurityTax: MoneyString.nullable(),
    box5MedicareWages: MoneyString.nullable(),
    box6MedicareTax: MoneyString.nullable(),
    box12: z.array(z.object({ code: z.string(), amount: MoneyString }).strict()),
    box13: z.object({
      statutoryEmployee: z.boolean(),
      retirementPlan: z.boolean(),
      thirdPartySickPay: z.boolean()
    }).strict(),
    stateRows: z.array(
      z.object({
        state: z.string(),
        stateWages: MoneyString.nullable(),
        stateWithholding: MoneyString.nullable()
      }).strict()
    )
  }).strict(),
  extraction: z.object({
    multipleDistinctW2sDetected: z.boolean(),
    unreadableFields: z.array(z.string()),
    warnings: z.array(z.string()),
    confidenceByField: z.array(z.object({
      field: z.string(),
      confidence: z.number().min(0).max(1)
    }).strict())
  }).strict()
}).strict();

export type ExtractedW2 = z.infer<typeof ExtractedW2Schema>;
