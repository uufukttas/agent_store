export type LeadInput = {
  companyName: string;
  domain: string;
  city?: string;
  employeeEstimate?: number;
  contactName?: string;
  contactRole?: string;
  score: number;
  scoreRationale: { signal: string; points: number; sourceIndex?: number }[];
  sources: { url: string; title?: string; quote: string }[];
};
