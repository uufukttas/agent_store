// Arayüz metinleri tek yerde tutulur; müşterilere açılırken İngilizce eklemek kolay olsun.
export const tr = {
  app: { name: "GradeUp Agent" },
  login: {
    title: "Giriş yap",
    email: "E-posta",
    password: "Parola",
    submit: "Giriş yap",
    pending: "Giriş yapılıyor",
    invalidInput: "Geçerli bir e-posta ve parola gir.",
    invalidCredentials: "E-posta veya parola hatalı.",
    domainNotAllowed: (domain: string) => `Yalnızca @${domain} adresleriyle giriş yapılabilir.`,
  },
  home: {
    title: "Genel bakış",
    emptyTitle: "Henüz agent yok",
    emptyBody: "İlk agent bir sonraki aşamada eklenecek.",
    signedInAs: "Giriş yapan",
    signOut: "Çıkış yap",
  },
} as const;
