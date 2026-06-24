export function maskSsn(ssn: string): string {
  return ssn.replace(/^\d{3}-\d{2}-/, "***-**-");
}

export function maskEin(ein: string): string {
  return ein.replace(/^\d{2}-\d{3}/, "**-***");
}

export function maskName(first: string, last: string): string {
  return `${first.slice(0, 1)}.... ${last.slice(0, 1)}.....`;
}

export const pinoRedactionPaths = [
  "req.headers.cookie",
  "req.body",
  "res.headers.set-cookie",
  "*.ssn",
  "*.ein",
  "*.address",
  "*.bytes",
  "*.fileData",
  "*.pdf"
];
