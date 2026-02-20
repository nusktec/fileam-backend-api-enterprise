export const HELP_FAQ_CATEGORIES = ["All", "VAT", "WHT", "PIT", "CIT", "Filing", "Other"] as const;

export const HELP_FAQS: { question: string; category: string; answer?: string }[] = [
  { question: "What do I need to know for VAT?", category: "VAT" },
  { question: "What is PITI tax in Nigeria?", category: "PIT" },
  { question: "How to CNC schedule for employee?", category: "Filing" },
  { question: "What about my TIN authentication?", category: "Other" },
  { question: "What is WHT filing?", category: "WHT" },
  { question: "Can I have limit exceed my tax volume?", category: "Other" },
  { question: "What is PITI deductions small companies?", category: "PIT" },
  { question: "When is VAT due?", category: "VAT" },
  { question: "What is CIT?", category: "CIT" },
];

export const HELP_ABOUT = {
  tagline: "Nigeria's Tax Compliance Made Simple.",
  mission:
    "FileAm serves as an online platform for small businesses to manage their tax compliance. Our digital platform helps businesses to pay taxes, manage their tax records, file tax returns, manage payments, and receive all tax-related information, thereby streamlining their tax compliance process.",
  taxCoverage: [
    { name: "VAT", rate: "10%" },
    { name: "CIT", rate: "30%" },
    { name: "WHT", rate: "25%" },
    { name: "PIT", rate: "25%" },
    { name: "Customs & Excise", rate: "10%" },
  ],
  footer: "© 2024 FileAm. All rights reserved.",
};
