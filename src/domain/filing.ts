export const FilingStatusValues = [
  "single",
  "married_filing_jointly",
  "married_filing_separately"
] as const;

export type FilingStatus = typeof FilingStatusValues[number];

export type PersonName = {
  firstName: string;
  middleInitial?: string | undefined;
  lastName: string;
  ssn: string;
};

export type FilingDetails =
  | {
      status: "single";
    }
  | {
      status: "married_filing_jointly";
      spouse: PersonName;
      spouseHadNoIncome: boolean;
      spouseHadNoOtherTaxDocuments: boolean;
    }
  | {
      status: "married_filing_separately";
      spouse: PersonName;
      livedApartOrLegallySeparated: boolean;
      spouseWillNotItemize: boolean;
      noNonresidentAlienRule: boolean;
    };

export function filingStatusLabel(status: FilingStatus): string {
  switch (status) {
    case "single": return "Single";
    case "married_filing_jointly": return "Married Filing Jointly";
    case "married_filing_separately": return "Married Filing Separately";
  }
}
