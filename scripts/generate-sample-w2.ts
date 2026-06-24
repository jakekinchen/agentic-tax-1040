import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { dollars } from "./shared.js";

const fixture = {
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
    box1WagesCents: 4_000_000,
    box2FederalWithholdingCents: 320_000,
    box3SocialSecurityWagesCents: 4_000_000,
    box4SocialSecurityTaxCents: 248_000,
    box5MedicareWagesCents: 4_000_000,
    box6MedicareTaxCents: 58_000,
    box12: [],
    box13: {
      statutoryEmployee: false,
      retirementPlan: false,
      thirdPartySickPay: false
    },
    stateRows: [
      { state: "OH", stateWagesCents: 4_000_000, stateWithholdingCents: 120_000 }
    ]
  }
};

function centsToDollars(cents: number): string {
  return dollars(cents / 100);
}

const sourceBytes = await readFile("assets/irs/2025/fw2.pdf");
const fontBytes = await readFile("assets/fonts/NotoSans-Regular.ttf");
const source = await PDFDocument.load(sourceBytes);
const out = await PDFDocument.create();
out.registerFontkit(fontkit);
const [firstPage] = await out.copyPages(source, [1]);
out.addPage(firstPage);
const page = out.getPage(0);
const font = await out.embedFont(fontBytes);
const height = page.getHeight();

page.drawText("FAKE TEST DATA - NOT FOR FILING", {
  x: 120,
  y: height - 32,
  size: 16,
  font,
  color: rgb(0.75, 0, 0)
});

const line = (text: string, x: number, y: number, size = 9): void => {
  page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
};

line(fixture.employee.ssn, 55, 705);
line(fixture.employer.ein, 55, 656);
line(fixture.employer.name, 55, 620);
line(fixture.employer.address.street, 55, 607);
line(`${fixture.employer.address.city}, ${fixture.employer.address.state} ${fixture.employer.address.zip}`, 55, 594);
line(`${fixture.employee.firstName} ${fixture.employee.lastName}`, 55, 486);
line(fixture.employee.address.street, 55, 425);
line(`${fixture.employee.address.city}, ${fixture.employee.address.state} ${fixture.employee.address.zip}`, 55, 412);
line(centsToDollars(fixture.boxes.box1WagesCents), 350, 705);
line(centsToDollars(fixture.boxes.box2FederalWithholdingCents), 490, 705);
line(centsToDollars(fixture.boxes.box3SocialSecurityWagesCents), 350, 674);
line(centsToDollars(fixture.boxes.box4SocialSecurityTaxCents), 490, 674);
line(centsToDollars(fixture.boxes.box5MedicareWagesCents), 350, 643);
line(centsToDollars(fixture.boxes.box6MedicareTaxCents), 490, 643);
line("OH", 55, 332);
line(centsToDollars(4_000_000), 150, 332);
line(centsToDollars(120_000), 255, 332);

await mkdir("fixtures", { recursive: true });
const pdfBytes = await out.save();
await writeFile(join("fixtures", "sample-w2-2025.pdf"), pdfBytes);
await writeFile(join("fixtures", "sample-w2-2025.json"), `${JSON.stringify(fixture, null, 2)}\n`);

const render = spawnSync("pdftoppm", ["-singlefile", "-png", "-r", "160", join("fixtures", "sample-w2-2025.pdf"), join("fixtures", "sample-w2-2025")], {
  stdio: "inherit"
});
if (render.status !== 0) throw new Error("pdftoppm failed while rendering sample W-2 PNG");

console.log("Generated sample W-2 PDF, PNG, and JSON");
