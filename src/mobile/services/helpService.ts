import { HELP_FAQS, HELP_ABOUT, HELP_FAQ_CATEGORIES } from "../../constants/help";

export const helpService = {
  getFaqs(category?: string) {
    const list = category && category !== "All"
      ? HELP_FAQS.filter((f) => f.category === category)
      : HELP_FAQS;
    return { categories: HELP_FAQ_CATEGORIES, faqs: list };
  },

  getAbout() {
    return HELP_ABOUT;
  },

  submitContact(_userId: string, _subject: string, _message: string) {
    return { success: true, message: "Support request received. We typically respond within 24hr." };
  },
};
