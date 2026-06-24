import { z } from "zod";
import { QuestionIds } from "../conversation/questions.js";

export const AnswerRequestSchema = z.object({
  questionId: z.enum(QuestionIds),
  payload: z.unknown(),
  freeText: z.string().optional()
}).strict();

export const ConfirmW2PayloadSchema = z.object({
  firstName: z.string().min(1),
  middleInitial: z.string().optional(),
  lastName: z.string().min(1),
  ssn: z.string().regex(/^\d{3}-\d{2}-\d{4}$/),
  street: z.string().min(1),
  apartment: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  zip: z.string().min(5),
  employerName: z.string().min(1),
  box1Wages: z.number().nonnegative(),
  box2FederalWithholding: z.number().min(0),
  taxYear: z.literal(2025)
}).strict();

export const FilingPayloadSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("single") }).strict(),
  z.object({
    status: z.literal("married_filing_jointly"),
    spouse: z.object({
      firstName: z.string().min(1),
      middleInitial: z.string().optional(),
      lastName: z.string().min(1),
      ssn: z.string().regex(/^\d{3}-\d{2}-\d{4}$/)
    }).strict(),
    spouseHadNoIncome: z.boolean(),
    spouseHadNoOtherTaxDocuments: z.boolean()
  }).strict(),
  z.object({
    status: z.literal("married_filing_separately"),
    spouse: z.object({
      firstName: z.string().min(1),
      middleInitial: z.string().optional(),
      lastName: z.string().min(1),
      ssn: z.string().regex(/^\d{3}-\d{2}-\d{4}$/)
    }).strict(),
    livedApartOrLegallySeparated: z.boolean(),
    spouseWillNotItemize: z.boolean(),
    noNonresidentAlienRule: z.boolean()
  }).strict()
]);

export const ScopePayloadSchema = z.object({
  noDependentsAndNotClaimable: z.boolean(),
  under65AndNotBlind: z.boolean(),
  onlyOneW2: z.boolean(),
  standardDeduction: z.boolean(),
  noMarketplaceSelfEmploymentForeignIncomeAdditionalTaxOrCredit: z.boolean(),
  noSchedule1ADeductions: z.boolean(),
  failedCondition: z.string().optional()
}).strict();

export const FormFlagsPayloadSchema = z.object({
  mainHomeInUS: z.boolean(),
  digitalAssets: z.union([z.boolean(), z.enum(["no", "yes"])])
}).strict().transform((payload) => ({
  mainHomeInUS: payload.mainHomeInUS,
  digitalAssets: typeof payload.digitalAssets === "boolean" ? payload.digitalAssets : payload.digitalAssets === "yes"
}));
