// All user-facing strings. Components must not contain literal UI text.
import type { CampaignInputError } from "../../modules/campaigns/types";

export const ru = {
  appName: "GM Helper",
  common: {
    save: "Сохранить",
    cancel: "Отмена",
    delete: "Удалить",
    create: "Создать",
    change: "Изменить",
    close: "Закрыть",
    loading: "Загрузка…",
    retry: "Повторить",
  },
  nav: {
    library: "Библиотека",
    battlemaps: "Баттлмапы",
    relations: "Отношения",
    timeline: "Хронология",
    settings: "Настройки",
  },
  startup: {
    errorTitle: "Не удалось запустить приложение",
  },
  firstRun: {
    title: "Добро пожаловать в GM Helper",
    text: "Выберите папку библиотеки артов. Внутри неё будут папки систем, в них — группы существ и фракций, а в группах — арты.",
    structureHint: "Система / Группа / арт.png",
    pick: "Выбрать папку…",
    missingTitle: "Папка библиотеки не найдена",
    missingText: (path: string) =>
      `Папка «${path}» недоступна. Возможно, её переместили или отключили диск. Выберите папку заново.`,
    dialogTitle: "Папка библиотеки артов",
  },
  campaign: {
    switcherLabel: "Кампания",
    none: "Нет кампании",
    new: "Новая кампания",
    edit: "Редактировать кампанию",
    name: "Название",
    system: "Система",
    systemHint:
      "Папка верхнего уровня в библиотеке. Можно ввести новую — папка будет создана позже.",
    description: "Описание",
    archived: "В архиве",
    archive: "В архив",
    unarchive: "Вернуть из архива",
    deleteTitle: "Удалить кампанию?",
    deleteText: (name: string) =>
      `Кампания «${name}» и все её данные будут удалены без возможности восстановления. Арты в библиотеке не пострадают.`,
    needCampaignTitle: "Нет активной кампании",
    needCampaignText: "Этот раздел относится к кампании. Создайте кампанию или выберите её сверху.",
    errors: {
      nameRequired: "Введите название",
      nameTooLong: "Слишком длинное название",
      systemRequired: "Укажите систему",
      systemInvalid:
        'Недопустимое имя папки: нельзя использовать < > : " / \\ | ? * и начинать с «_» или «.»',
    } satisfies Record<CampaignInputError, string>,
  },
  settings: {
    title: "Настройки",
    libraryRoot: "Папка библиотеки артов",
    campaigns: "Кампании",
    noCampaigns: "Кампаний пока нет.",
  },
  placeholder: {
    comingSoon: (stage: number) => `Раздел появится на этапе ${stage}.`,
  },
} as const;
