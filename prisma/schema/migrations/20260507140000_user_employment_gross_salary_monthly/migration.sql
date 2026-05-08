-- Monthly gross salary (employment) for PAYE estimates when tax persona flags PAYE (e.g. PAYEE).
ALTER TABLE "User" ADD COLUMN "employment_gross_salary_monthly" DECIMAL(14,2);
