import "../i18n";
import i18n from "i18next";

describe("i18n", () => {
  it("contains getterInput.placeholder in English", () => {
    i18n.changeLanguage("en");
    const val = i18n.t("getterInput.placeholder");
    expect(typeof val).toBe("string");
    expect(val.length).toBeGreaterThan(0);
  });

  it("contains getterInput.placeholder in French", () => {
    i18n.changeLanguage("fr-FR");
    const val = i18n.t("getterInput.placeholder");
    expect(val).toContain("URL");
  });
});
