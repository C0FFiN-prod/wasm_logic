import { mdToHtml } from "./mdParser"

export type I18nLocaleSection = Record<string, string | string[]>
export type I18nLocale = Record<string, I18nLocaleSection>
export type I18nLocales<LocaleName extends string, Locale extends I18nLocale> = Record<LocaleName, Locale>

export class I18n<Locale extends I18nLocale, LocaleNames extends string, Locales extends I18nLocales<LocaleNames, Locale>> {

  private static lsKey = 'locale'

  private locales: Locales
  private defaultLocale: LocaleNames

  constructor(locales: Locales, defaultLocale: LocaleNames) {
    this.locales = locales;
    this.defaultLocale = defaultLocale;

    addEventListener('load', () => {
      this.render()
    })
  }

  get localeName(): LocaleNames {
    const lsLocaleName = localStorage.getItem(I18n.lsKey)
    if (lsLocaleName == null || !Object.keys(this.locales).includes(lsLocaleName)) return this.defaultLocale

    return lsLocaleName as LocaleNames
  }

  private get locale() {
    return this.locales[this.localeName]
  }

  private render() {
    const attributes = document.querySelectorAll('[data-locale]')
    attributes.forEach(attribute => {
      if (!(attribute instanceof HTMLElement)) return

      const section = attribute.closest('[data-locale-section]')
      if (section == null || !(section instanceof HTMLElement)) return

      const sectionName = section.dataset.localeSection
      const key = attribute.dataset.locale

      if (!sectionName || !key) return

      attribute.innerHTML = this.getValue(sectionName, key)
    })
  }

  private saveLocaleName(localeName: LocaleNames) {
    if (localeName === this.defaultLocale) {
      localStorage.removeItem(I18n.lsKey)
      return
    }

    localStorage.setItem(I18n.lsKey, localeName)
  }

  setLocale(localeName: LocaleNames) {
    this.saveLocaleName(localeName)
    this.render()
  }

  getValue<LocaleSection extends keyof Locale>(section: LocaleSection, key: keyof Locale[LocaleSection]) {
    return key.toString().startsWith('md-') ?
      mdToHtml((this.locale[section]?.[key] ?? []) as string[]) :
      (this.locale[section]?.[key] as string ?? '');
  }
}
