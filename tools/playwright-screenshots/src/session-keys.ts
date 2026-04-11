/** Должны совпадать с apps/web/lib/session-keys.ts */
export const ACCESS_TOKEN_KEY = "dayday_access_token";
export const USER_KEY = "dayday_user";
export const ORGS_KEY = "dayday_organizations";
/** См. apps/web/lib/i18n/client-i18n.ts */
export const I18N_LANG_STORAGE_KEY = "dayday_i18n_lang";

export type SavedSession = {
  accessToken: string | null;
  user: string | null;
  orgs: string | null;
};
