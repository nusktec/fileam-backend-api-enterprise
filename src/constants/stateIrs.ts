/**
 * Official State Internal Revenue Service (SIRS) public websites.
 * PAYE is remitted to the state IRS for the business location, not FileAm.
 *
 * Update a URL here when a government portal changes.
 */
export type StateIrsPortal = {
  state: string;
  authority: string;
  url: string;
};

const STATE_IRS_BY_KEY: Record<string, StateIrsPortal> = {
  abia: {
    state: "Abia",
    authority: "Abia State Internal Revenue Service",
    url: "https://abiairs.ng/",
  },
  adamawa: {
    state: "Adamawa",
    authority: "Adamawa State Internal Revenue Service",
    url: "https://adamawaitrs.gov.ng/",
  },
  "akwa ibom": {
    state: "Akwa Ibom",
    authority: "Akwa Ibom State Internal Revenue Service",
    url: "https://akirs.gov.ng/",
  },
  anambra: {
    state: "Anambra",
    authority: "Anambra State Internal Revenue Service",
    url: "https://airs.an.gov.ng/",
  },
  bauchi: {
    state: "Bauchi",
    authority: "Bauchi State Internal Revenue Service",
    url: "https://bauchiirs.gov.ng/",
  },
  bayelsa: {
    state: "Bayelsa",
    authority: "Bayelsa State Internal Revenue Service",
    url: "https://byirs.gov.ng/",
  },
  benue: {
    state: "Benue",
    authority: "Benue State Internal Revenue Service",
    url: "https://birs.be.gov.ng/",
  },
  borno: {
    state: "Borno",
    authority: "Borno State Internal Revenue Service",
    url: "https://bornoirs.gov.ng/",
  },
  "cross river": {
    state: "Cross River",
    authority: "Cross River State Internal Revenue Service",
    url: "https://crirs.gov.ng/",
  },
  delta: {
    state: "Delta",
    authority: "Delta State Internal Revenue Service",
    url: "https://dsirs.dl.gov.ng/",
  },
  ebonyi: {
    state: "Ebonyi",
    authority: "Ebonyi State Internal Revenue Service",
    url: "https://ebonyiirs.gov.ng/",
  },
  edo: {
    state: "Edo",
    authority: "Edo State Internal Revenue Service",
    url: "https://www.eirs.gov.ng/",
  },
  ekiti: {
    state: "Ekiti",
    authority: "Ekiti State Internal Revenue Service",
    url: "https://ekitistateirs.gov.ng/",
  },
  enugu: {
    state: "Enugu",
    authority: "Enugu State Internal Revenue Service",
    url: "https://irs.enugustate.gov.ng/",
  },
  gombe: {
    state: "Gombe",
    authority: "Gombe State Internal Revenue Service",
    url: "https://girs.gm.gov.ng/",
  },
  imo: {
    state: "Imo",
    authority: "Imo State Internal Revenue Service",
    url: "https://imoirs.gov.ng/",
  },
  jigawa: {
    state: "Jigawa",
    authority: "Jigawa State Internal Revenue Service",
    url: "https://jigawairs.gov.ng/",
  },
  kaduna: {
    state: "Kaduna",
    authority: "Kaduna State Internal Revenue Service",
    url: "https://kadirs.gov.ng/",
  },
  kano: {
    state: "Kano",
    authority: "Kano State Internal Revenue Service",
    url: "https://kirs.gov.ng/",
  },
  katsina: {
    state: "Katsina",
    authority: "Katsina State Internal Revenue Service",
    url: "https://katsinairs.gov.ng/",
  },
  kebbi: {
    state: "Kebbi",
    authority: "Kebbi State Internal Revenue Service",
    url: "https://kebbiirs.gov.ng/",
  },
  kogi: {
    state: "Kogi",
    authority: "Kogi State Internal Revenue Service",
    url: "https://kogistateirs.gov.ng/",
  },
  kwara: {
    state: "Kwara",
    authority: "Kwara State Internal Revenue Service",
    url: "https://kw-irs.com/",
  },
  lagos: {
    state: "Lagos",
    authority: "Lagos State Internal Revenue Service",
    url: "https://lirs.gov.ng/",
  },
  nasarawa: {
    state: "Nasarawa",
    authority: "Nasarawa State Internal Revenue Service",
    url: "https://nirs.gov.ng/",
  },
  niger: {
    state: "Niger",
    authority: "Niger State Internal Revenue Service",
    url: "https://ngirs.gov.ng/",
  },
  ogun: {
    state: "Ogun",
    authority: "Ogun State Internal Revenue Service",
    url: "https://ogirs.og.gov.ng/",
  },
  ondo: {
    state: "Ondo",
    authority: "Ondo State Internal Revenue Service",
    url: "https://odirs.gov.ng/",
  },
  osun: {
    state: "Osun",
    authority: "Osun State Internal Revenue Service",
    url: "https://osirs.org/",
  },
  oyo: {
    state: "Oyo",
    authority: "Oyo State Internal Revenue Service",
    url: "https://oyirs.oyostate.gov.ng/",
  },
  plateau: {
    state: "Plateau",
    authority: "Plateau State Internal Revenue Service",
    url: "https://psirs.gov.ng/",
  },
  rivers: {
    state: "Rivers",
    authority: "Rivers State Internal Revenue Service",
    url: "https://www.riversstateirs.gov.ng/",
  },
  sokoto: {
    state: "Sokoto",
    authority: "Sokoto State Internal Revenue Service",
    url: "https://sokotoirs.gov.ng/",
  },
  taraba: {
    state: "Taraba",
    authority: "Taraba State Internal Revenue Service",
    url: "https://tarabairs.gov.ng/",
  },
  yobe: {
    state: "Yobe",
    authority: "Yobe State Internal Revenue Service",
    url: "https://yobeirs.gov.ng/",
  },
  zamfara: {
    state: "Zamfara",
    authority: "Zamfara State Internal Revenue Service",
    url: "https://zamfarairs.gov.ng/",
  },
  "abuja (fct)": {
    state: "Abuja (FCT)",
    authority: "FCT Internal Revenue Service",
    url: "https://fctirs.gov.ng/",
  },
};

const STATE_ALIASES: Record<string, string> = {
  fct: "abuja (fct)",
  abuja: "abuja (fct)",
  "federal capital territory": "abuja (fct)",
  "fct abuja": "abuja (fct)",
  "lagos state": "lagos",
  la: "lagos",
  "akwa-ibom": "akwa ibom",
  akwaibom: "akwa ibom",
  "cross-river": "cross river",
  crossriver: "cross river",
  nasarawa: "nasarawa",
  nassarawa: "nasarawa",
};

function normalizeStateKey(value: string): string {
  let key = value.trim().toLowerCase().replace(/\s+/g, " ");
  key = key.replace(/\s+state$/, "");
  return STATE_ALIASES[key] ?? key;
}

export function resolveStateIrsPortal(
  state: string | null | undefined,
): StateIrsPortal | null {
  if (!state || !String(state).trim()) return null;
  const key = normalizeStateKey(state);
  return STATE_IRS_BY_KEY[key] ?? null;
}

export function listStateIrsPortals(): StateIrsPortal[] {
  return Object.values(STATE_IRS_BY_KEY);
}
